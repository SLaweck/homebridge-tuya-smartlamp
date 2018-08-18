const { Subject } = require('rxjs');
const { debounceTime } = require('rxjs/operators');
const Tuya = require('tuyapi');
const async = require('async');
// const Queue = require('async/queue');
// const Retryable = require('async/retryable');
const debug = require('debug')('TuyaAccessory');

class TuyaAccessory {
  constructor(log, config) {
    this.log = log;
    this.devices = {};
    // eslint-disable-next-line new-cap
    this.resolveQueue = new async.queue((task, callback) => task(callback));
    // eslint-disable-next-line new-cap
    this.updateQueue = new async.queue((task, callback) => task(callback));
    config.devices.forEach((device) => {
      const deviceId = device.devId;
      const tuyaDevice = {
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
        // setSubject: new Subject(),
      };
      // tuyaDevice.setSubject.pipe(
      //   debounceTime(150),
      // ).subscribe(set => set.task.call(this, deviceId, ...set.args)); // set.task(deviceId, ...set.args).then().catch()
      this.devices[deviceId] = tuyaDevice;
    });
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
      setPropSubject = new Subject();
      this.getDev(deviceId).setPropSubjects[dps] = setPropSubject;
      setPropSubject.pipe(
        debounceTime(150),
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
          debug(this.this.getDevName(devId), 'resolve IP error');
          callback(error);
        });
    });
    return new Promise((resolve, reject) => {
      retryable(deviceId, (error, tuya) => {
        // console.log('retryable', tuya, error);
        if (error) {
          reject(error);
        } else {
          this.log(`Resolve ${this.getDevName(deviceId)} IP: ${tuya.device.ip}`);
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
    const dps = await this.getSchema(deviceId);
    return dps[index];
  }

  async getProperties(deviceId, indexes) {
    const dps = await this.getSchema(deviceId);
    return indexes.map(key => dps[key]);
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
    return this.getProperty(deviceId, this.getOnOffDps(deviceId));
  }

  async setOnOff(deviceId, onOff) {
    return this.setProperty(deviceId, this.getOnOffDps(deviceId), onOff);
  }

  async getBright(deviceId) {
    let result;
    const dps = this.getBrightDps(deviceId);
    if (dps) {
      result = await this.getProperty(deviceId, dps);
    } else {
      result = -1;
    }
    return result;
  }

  async setBright(deviceId, bright) {
    let result;
    const dps = this.getBrightDps(deviceId);
    if (dps) {
      result = await this.setProperty(deviceId, dps, bright);
      const onOff = await this.getOnOff(deviceId);
      if (!onOff) {
        this.setOnOff(deviceId, onOff);
      }
    } else {
      result = -1;
    }
    return result;
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
    let result;
    const dps = this.getTempDps(deviceId);
    if (dps) {
      result = await this.getProperty(deviceId, dps);
    } else {
      result = -1;
    }
    return result;
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
}

module.exports = TuyaAccessory;
