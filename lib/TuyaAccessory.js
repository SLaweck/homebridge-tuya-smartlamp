const { Subject } = require('rxjs');
const { debounceTime } = require('rxjs/operators');
const Tuya = require('tuyapi');
const async = require('async');
const debug = require('debug')('TuyaAccessory');

class TuyaAccessory {
  constructor(log, config) {
    // this.log = log;
    this.devices = {};
    // eslint-disable-next-line new-cap
    this.resolveQueue = new async.queue((task, callback) => task(callback));
    // eslint-disable-next-line new-cap
    this.updateQueue = new async.queue((task, callback) => task(callback));
    config.devices.forEach((device) => {
      this.addDevice(log, device);
    });
  }

  addDevice(log, device) {
    const deviceId = device.devId;
    const tuyaDevice = {
      log,
      name: device.name,
      serialNumber: device.productId || deviceId,
      tuya: new Tuya({
        id: deviceId,
        key: device.localKey,
      }),
      isDimmable: device.type.includes('dimmable'),
      isTunable: device.type.includes('tunable'),
      isColor: device.type.includes('color'),
      isLoadingTuyaIP: false,
      hasLoadedTuyaIP: false,
      getHandleQueuedPromises: [],
      isRequestingSchema: false,
      getSchemaQueuedPromises: [],
      setPropSubjects: [],
      setPropDelay: 0,
    };
    if (tuyaDevice.isColor) {
      tuyaDevice.setPropDelay = 200;
    }
    this.devices[deviceId] = tuyaDevice;
  }

  log(deviceId, ...args) {
    return this.devices[deviceId].log('[TA]', ...args);
  }

  getDev(deviceId) {
    return this.devices[deviceId];
  }

  getDevName(deviceId) {
    return this.devices[deviceId].name;
  }

  getDevTuya(deviceId) {
    return this.devices[deviceId].tuya;
  }

  getOnOffDps(deviceId) {
    return this.getDev(deviceId) ? 1 : null;
  }

  getModeDps(deviceId) {
    return this.getDev(deviceId).isColor ? 2 : null;
  }

  getBrightDps(deviceId) {
    // eslint-disable-next-line no-nested-ternary
    return this.getDev(deviceId).isDimmable
      ? (this.getDev(deviceId).isColor ? 3 : 2)
      : null;
  }

  getTempDps(deviceId) {
    // eslint-disable-next-line no-nested-ternary
    return this.getDev(deviceId).isTunable
      ? (this.getDev(deviceId).isColor ? 4 : 3)
      : null;
  }

  nextSetProp(deviceId, dps, setProp) {
    let setPropSubject = this.getDev(deviceId).setPropSubjects[dps];
    if (!setPropSubject) {
      const debounce = this.getDev(deviceId).isColor ? 250 : 50;
      setPropSubject = new Subject();
      this.getDev(deviceId).setPropSubjects[dps] = setPropSubject;
      setPropSubject.pipe(
        debounceTime(debounce),
      ).subscribe(set => set.task.call(this, deviceId, ...set.args));
    }
    setPropSubject.next(setProp);
  }

  async resolveId(deviceId) {
    return new Promise((resolve, reject) => {
      this.updateQueue.push((callback) => {
        // this.resolveIdNow(deviceId)
        this.resolveIdNowRetryable(deviceId)
          .then(result => callback(null, result))
          .catch(callback);
      }, (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      });
    });
  }

  async resolveIdNowRetryable(deviceId) {
    // console.log('call resolveIdNowRetryable', deviceId);
    // eslint-disable-next-line new-cap
    const retryable = new async.retryable({ times: 25, interval: retryCount => 100 * retryCount }, (devId, callback) => {
      this.getDevTuya(devId).resolveId()
        .then(() => {
          callback(null, this.getDevTuya(devId));
        })
        .catch((error) => {
          this.log(devId, this.this.getDevName(devId), 'resolve IP error');
          callback(error);
        });
    });
    return new Promise((resolve, reject) => {
      retryable(deviceId, (error, tuya) => {
        // console.log('retryable', tuya, error);
        if (error) {
          reject(error);
        } else {
          this.log(deviceId, `Resolve ${this.getDevName(deviceId)} IP: ${tuya.device.ip}`);
          resolve(tuya);
        }
      });
    });
  }

  async resolveIdNow(deviceId) {
    return new Promise((resolve, reject) => {
      this.getDevTuya(deviceId).resolveId()
        .then(() => {
          resolve(this.getDevTuya(deviceId));
        })
        .catch((error) => {
          reject(error);
        });
    });
  }

  async getHandle(deviceId) {
    return new Promise((resolve, reject) => {
      if (this.getDev(deviceId).hasLoadedTuyaIP) {
        resolve(this.getDevTuya(deviceId));
      } else if (this.getDev(deviceId).isLoadingTuyaIP) {
        this.getDev(deviceId).getHandleQueuedPromises.push({
          resolve,
          reject,
        });
      } else {
        this.getDev(deviceId).isLoadingTuyaIP = true;
        this.resolveId(deviceId)
          .then(() => {
            this.getDev(deviceId).hasLoadedTuyaIP = true;
            resolve(this.getDevTuya(deviceId));
            this.getDev(deviceId).getHandleQueuedPromises.forEach((callback) => {
              callback.resolve(this.getDevTuya(deviceId));
            });
          })
          .catch((error) => {
            reject(error);
            this.getDev(deviceId).getHandleQueuedPromises.forEach((callback) => {
              callback.reject(error);
            });
          })
          .then(() => {
            this.getDev(deviceId).isLoadingTuyaIP = false;
            this.getDev(deviceId).getHandleQueuedPromises = [];
          });
      }
    });
  }

  async getProperty(deviceId, index) {
    return new Promise((resolve, reject) => {
      this.getSchema(deviceId)
        .then((props) => {
          try {
            const prop = props[index];
            resolve(prop);
          } catch (error) {
            reject(error);
          }
        })
        .catch(error => reject(error));
    });
  }

  async getProperties(deviceId, indexes) {
    return new Promise((resolve, reject) => {
      this.getSchema(deviceId)
        .then((props) => {
          try {
            const propMap = indexes.map(key => props[key]);
            resolve(propMap);
          } catch (error) {
            reject(error);
          }
        })
        .catch(error => reject(error));
    });
  }

  async getSchema(deviceId) {
    return new Promise((resolve, reject) => {
      if (this.getDev(deviceId).isRequestingSchema) {
        this.getDev(deviceId).getSchemaQueuedPromises.push({
          resolve,
          reject,
        });
      } else {
        this.getDev(deviceId).isRequestingSchema = true;
        this.getHandle(deviceId)
          .then(handle => handle.get({ schema: true }))
          .then((result) => {
            debug(`Got ${this.getDevName(deviceId)} schema with result: ${JSON.stringify(result)}`);
            const { dps } = result;
            resolve(dps);
            this.getDev(deviceId).getSchemaQueuedPromises.forEach((callback) => {
              callback.resolve(dps);
            });
          })
          .catch((error) => {
            reject(error);
            this.getDev(deviceId).getSchemaQueuedPromises.forEach((callback) => {
              callback.reject(error);
            });
          })
          .then(() => {
            this.getDev(deviceId).isRequestingSchema = false;
            this.getDev(deviceId).getSchemaQueuedPromises = [];
          });
      }
    });
  }

  async setProperty(deviceId, index, newValue) {
    // debug(deviceId, index, newValue, this);
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        this.updateQueue.push((callback) => {
          this.setPropertyNow(deviceId, index, newValue)
            .then((result) => {
              debug(`${this.getDevName(deviceId)} property ${index} setted to ${newValue}`);
              callback(null, result);
            })
            .catch(callback);
        }, (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        });
      }, this.setPropDelay);
    });
  }

  async setPropertyNow(deviceId, index, newValue) {
    return new Promise((resolve, reject) => {
      this.getHandle(deviceId)
        .then(handle => handle.set({ dps: index.toString(), set: newValue }))
        .then(resolve)
        .catch((error) => {
          this.getDev(deviceId).hasLoadedTuyaIP = false;
          reject(error);
        });
    });
  }

  async setPropertyDebounce(deviceId, index, newValue) {
    this.nextSetProp(deviceId, index, { task: this.setProperty, args: [index, newValue] });
    return true;
  }

  async getOnOff(deviceId) {
    return new Promise((resolve, reject) => {
      this.getProperty(deviceId, this.getOnOffDps(deviceId))
        .then((onOff) => {
          this.log(deviceId, 'device is', onOff ? 'on' : 'off');
          resolve(onOff);
        })
        .catch((error) => {
          this.log(deviceId, 'getting device on/off error', error.message);
          reject(error);
        });
    });
  }

  async setOnOff(deviceId, onOff) {
    return new Promise((resolve, reject) => {
      this.setProperty(deviceId, this.getOnOffDps(deviceId), onOff)
        .then((result) => {
          this.log(deviceId, 'set device', onOff ? 'on' : 'off', result ? 'success' : 'fail');
          resolve(result);
        })
        .catch((error) => {
          this.log(deviceId, 'setting device on/off error', error.message);
          reject(error);
        });
    });
  }

  async getBright(deviceId) {
    let bright;
    const dps = this.getBrightDps(deviceId);
    if (dps) {
      bright = await this.getProperty(deviceId, dps);
      this.log(deviceId, 'device bright is', bright);
    } else {
      bright = -1;
    }
    return bright;
  }

  async setBright(deviceId, bright) {
    return new Promise((resolve, reject) => {
      const dps = this.getBrightDps(deviceId);
      if (dps) {
        this.setProperty(deviceId, dps, bright)
          .then((result) => {
            this.getOnOff(deviceId)
              .then((onOff) => {
                if (!onOff) {
                  this.setOnOff(deviceId, onOff);
                }
                this.log(deviceId, 'set device bright to', bright, result ? 'success' : 'fail');
                resolve(result);
              });
          })
          .catch((error) => {
            this.log(deviceId, 'setting device bright error', error.message);
            reject(error);
          });
      } else {
        resolve(-1);
      }
    });
  }

  async setBrightDebounce(deviceId, bright) {
    let result;
    const dps = this.getBrightDps(deviceId);
    if (dps) {
      this.nextSetProp(deviceId, dps, { task: this.setBright, args: [bright] });
      result = true;
    } else {
      result = -1;
    }
    return result;
  }

  async getTemp(deviceId) {
    let temp;
    const dps = this.getTempDps(deviceId);
    if (dps) {
      temp = await this.getProperty(deviceId, dps);
      this.log(deviceId, 'device temp is', temp);
    } else {
      temp = -1;
    }
    return temp;
  }

  async setTemp(deviceId, temp) {
    let result;
    const dps = this.getTempDps(deviceId);
    if (dps) {
      result = await this.setProperty(deviceId, dps, temp);
      const onOff = await this.getOnOff(deviceId);
      if (!onOff) {
        this.setOnOff(deviceId, onOff);
      }
      await this.setWhiteMode(deviceId);
      this.log(deviceId, 'set device temp to', temp, result ? 'success' : 'fail');
    } else {
      result = -1;
    }
    return result;
  }

  async setTempDebounce(deviceId, temp) {
    let result;
    const dps = this.getTempDps(deviceId);
    if (dps) {
      this.nextSetProp(deviceId, dps, { task: this.setTemp, args: [temp] });
      result = true;
    } else {
      result = -1;
    }
    return result;
  }

  async setColorMode(deviceId) {
    let result;
    const dps = this.getModeDps(deviceId);
    if (dps) {
      result = await this.setProperty(deviceId, dps, 'color');
      this.log(deviceId, 'set device to color mode', result ? 'success' : 'fail');
    } else {
      result = -1;
    }
    return result;
  }

  async setWhiteMode(deviceId) {
    let result;
    const dps = this.getModeDps(deviceId);
    if (dps) {
      result = await this.setProperty(deviceId, dps, 'white');
      this.log(deviceId, 'set device to white mode', result ? 'success' : 'fail');
    } else {
      result = -1;
    }
    return result;
  }
}

module.exports = TuyaAccessory;
