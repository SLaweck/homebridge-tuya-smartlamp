const { Subject } = require('rxjs');
const { debounceTime } = require('rxjs/operators');
const Tuya = require('tuyapi');
const async = require('async');
const debug = require('debug')('TuyaAccessory');
const TuyaLightBulb = require('./TuyaLightBulb');
const TuyaOutlet = require('./TuyaOutlet');
const TuyaGeneric = require('./TuyaGeneric');

class TuyaAccessory {
  constructor(config, log, homebridge) {
    debug('constructor');
    this.devices = {};
    // eslint-disable-next-line new-cap
    this.resolveQueue = new async.queue((task, callback) => task(callback));
    // eslint-disable-next-line new-cap
    this.updateQueue = new async.queue((task, callback) => task(callback));
    if (config) {
      config.accessories.forEach((device) => {
        if (device.accessory === 'TuyaSmartDevice') {
          debug('Add device from config', device);
          this.addDevice(log, device, homebridge);
        }
      });
    }
  }

  addDevice(log, config, homebridge) {
    debug('addDevice', log);
    const deviceId = config.devId;
    const tuyaDevice = {
      log,
      name: config.name,
      serialNumber: config.productId || deviceId,
      tuya: new Tuya({
        id: deviceId,
        key: config.localKey,
        ip: config.ip,
      }),
      // isLightbulb: config.type.includes('lightbulb'),
      // isDimmable: config.type.includes('dimmable'),
      // isTunable: config.type.includes('tunable'),
      isColor: config.type.includes('color'),
      isLoadingTuyaIP: false,
      hasLoadedTuyaIP: false,
      getHandleQueuedPromises: [],
      isRequestingSchema: false,
      getSchemaQueuedPromises: [],
      setPropSubjects: [],
      onPropertyDelay: 0,
    };
    if (config.ip) {
      tuyaDevice.hasLoadedTuyaIP = true;
    }
    if (tuyaDevice.isColor) {
      tuyaDevice.onPropertyDelay = 200;
    }
    this.devices[deviceId] = tuyaDevice;
    let tdev = null;
    if (config.type.includes('lightbulb')) {
      tdev = new TuyaLightBulb(this, config, homebridge);
    } else if (config.type.includes('outlet')) {
      tdev = new TuyaOutlet(this, config, homebridge);
    } else {
      tdev = new TuyaGeneric(this, config, homebridge);
    }
    return tdev;
  }

  log(deviceId, ...args) {
    this.devices[deviceId].log('[TA]', ...args);
  }

  error(deviceId, ...args) {
    if (this.devices[deviceId].log.error) {
      this.devices[deviceId].log.error('[TA]', ...args);
    } else {
      this.devices[deviceId].log('[TA]', ...args);
    }
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

  /*
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
  */

  async resolveId(deviceId) {
    return new Promise((resolve, reject) => {
      debug('call resolveId', this.getDevName(deviceId));
      this.resolveQueue.push((callback) => {
        // this.resolveIdNow(deviceId)
        this.resolveIdNowRetryable(deviceId)
          .then(result => callback(null, result))
          .catch(error => callback(error));
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
    const interval = (retryCount) => {
      debug('call interval in retryable in resolveIdNowRetryable', this.getDevName(deviceId), 'retryCount', retryCount);
      return 250 * retryCount;
    };
    // eslint-disable-next-line new-cap
    const retryable = new async.retryable({ times: 3, interval }, (devId, callback) => {
      debug('call retryable in resolveIdNowRetryable', this.getDevName(deviceId));
      this.getDevTuya(devId).find()
        .then(() => {
          try {
            this.getDevTuya(deviceId).on('error', error => {
              this.getDev(deviceId).hasLoadedTuyaIP = false;
              callback(error);
            });
            this.getDevTuya(devId).connect()
              .then(() => {
                callback(null, this.getDevTuya(devId));
              })
              .catch((error) => {
                this.log(devId, this.getDevName(devId), 'connect error', error);
                callback(error);
              });
          } catch (error) {
            this.log(deviceId, this.getDevName(deviceId), 'connect attempt error', error);
            callback(error);
          }
        })
        .catch((error) => {
          this.log(devId, this.getDevName(devId), this.getDevTuya(deviceId).device, 'find IP error', error);
          callback(error);
        });
    });
    return new Promise((resolve, reject) => {
      debug('call resolveIdNowRetryable', this.getDevName(deviceId));
      retryable(deviceId, (error, tuya) => {
        // console.log('retryable', tuya, error);
        if (error) {
          reject(error);
        } else {
          this.log(deviceId, `Resolve & connect ${this.getDevName(deviceId)} IP: ${tuya.device.ip}`);
          resolve(tuya);
        }
      });
    });
  }

  async resolveIdNow(deviceId) {
    return new Promise((resolve, reject) => {
      debug('call resolveIdNow', this.getDevName(deviceId));
      this.getDevTuya(deviceId).find()
        .then(() => {
          try {
            this.log(deviceId, `Resolve ${this.getDevName(deviceId)} IP: ${this.getDevTuya(deviceId).device.ip}`);
            this.getDevTuya(deviceId).on('error', error => {
              this.getDev(deviceId).hasLoadedTuyaIP = false;
              reject(error);
            });
            this.getDevTuya(deviceId).connect()
              .then(() => {
                this.log(deviceId, `${this.getDevName(deviceId)} connected`);
                resolve(this.getDevTuya(deviceId));
              })
              .catch((error) => {
                this.log(deviceId, this.getDevName(deviceId), 'connect error', error);
                reject(error);
              });
          } catch (error) {
            this.log(deviceId, this.getDevName(deviceId), 'connect attempt error', error);
            reject(error);
          }
        })
        .catch((error) => {
          this.log(deviceId, this.getDevName(deviceId), this.getDevTuya(deviceId).device, 'find IP error', error);
          reject(error);
        });
    });
  }

  async getHandle(deviceId) {
    return new Promise((resolve, reject) => {
      debug('call getHandle', this.getDevName(deviceId));
      if (this.getDev(deviceId).hasLoadedTuyaIP && this.getDevTuya(deviceId) && this.getDevTuya(deviceId).isConnected()) {
        resolve(this.getDevTuya(deviceId));
      } else if (this.getDev(deviceId).isLoadingTuyaIP) {
        this.getDev(deviceId).getHandleQueuedPromises.push({
          resolve,
          reject,
        });
      } else {
        this.getDev(deviceId).isLoadingTuyaIP = true;
        try {
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
        } catch (error) {
          this.getDev(deviceId).isLoadingTuyaIP = false;
        }
      }
    });
  }

  async getSchemaRetryable(deviceId) {
    const interval = (retryCount) => {
      debug('call interval in retryable in getSchemaRetryable', this.getDevName(deviceId), 'retryCount', retryCount);
      if (retryCount > 5) {
        debug('interval in retryable in getSchemaRetryable', this.getDevName(deviceId), 'Clear IP address');
        this.getDev(deviceId).hasLoadedTuyaIP = false;
        this.getDevTuya(deviceId).disconnect();
        delete this.getDevTuya(deviceId).device.ip;
      }
      return 250 * retryCount;
    };
    // eslint-disable-next-line new-cap
    const retryable = new async.retryable({ times: 7, interval }, (callback) => {
      debug('call retryable in getSchemaRetryable', this.getDevName(deviceId));
      try {
        this.getHandle(deviceId)
          .then((handle) => {
            try {
              handle.get({ schema: true })
                .then((schema) => {
                  if (schema.devId === deviceId && typeof schema.dps === 'object') {
                    callback(null, schema);
                  } else {
                    const error = new Error(`Got wrong JSON as schema: ${JSON.stringify(schema)}`);
                    this.error(deviceId, 'retryable in getSchemaRetryable error:', error.message);
                    callback(error);
                  }
                })
                .catch((error) => {
                  // debug('retryable in getSchemaRetryable', this.getDevName(deviceId), 'get schema error', error.message);
                  this.error(deviceId, 'retryable in getSchemaRetryable get schema error:', error.message);
                  callback(error);
                });
            } catch (error) {
              callback(error);
            }
          })
          .catch(error => callback(error));
      } catch (error) {
        callback(error);
      }
    });
    return new Promise((resolve, reject) => {
      debug('call getSchemaRetryable', this.getDevName(deviceId));
      retryable((error, achema) => {
        // console.log('retryable', tuya, error);
        if (error) {
          reject(error);
        } else {
          resolve(achema);
        }
      });
    });
  }

  async getSchema(deviceId) {
    return new Promise((resolve, reject) => {
      debug('call getSchema', this.getDevName(deviceId));
      if (this.getDev(deviceId).isRequestingSchema) {
        this.getDev(deviceId).getSchemaQueuedPromises.push({
          resolve,
          reject,
        });
      } else {
        this.getDev(deviceId).isRequestingSchema = true;
        // this.getHandle(deviceId)
        //   .then(handle => handle.get({ schema: true }))
        this.getSchemaRetryable(deviceId)
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

  async getProperty(deviceId, index) {
    return new Promise((resolve, reject) => {
      debug('call getProperty', this.getDevName(deviceId), 'index', index);
      this.getSchema(deviceId)
        .then((props) => {
          if (props[index] !== undefined) {
            resolve(props[index]);
          } else {
            reject(new Error(`device schema doesn't have property at index ${index} - ${JSON.stringify(props)}`));
          }
        })
        .catch(error => reject(error));
    });
  }

  async getProperties(deviceId, indexes) {
    return new Promise((resolve, reject) => {
      debug('call getProperties', this.getDevName(deviceId), 'indexes', indexes);
      this.getSchema(deviceId)
        .then((props) => {
          let index;
          const fault = indexes.some((idx) => {
            let result;
            if (props[idx] !== undefined) {
              result = false;
            } else {
              result = true;
              index = idx;
            }
            return result;
          });
          if (!fault) {
            resolve(indexes.map(key => props[key]));
          } else {
            reject(new Error(`device schema doesn't have property at index ${index} - ${JSON.stringify(props)}`));
          }
        })
        .catch(error => reject(error));
    });
  }

  async setProperty(deviceId, index, newValue) {
    return new Promise((resolve, reject) => {
      debug('call setProperty', this.getDevName(deviceId), 'index', index, '<=', newValue);
      this.updateQueue.push((callback) => {
        this.setPropertyNowRetryable(deviceId, index, newValue)
          .then(result => callback(null, result))
          .catch(error => callback(error));
      }, (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      });
    });
  }

  async setPropertyNowRetryable(deviceId, index, newValue) {
    const interval = (retryCount) => {
      debug('call interval in retryable in setPropertyNowRetryable', this.getDevName(deviceId), 'retryCount', retryCount);
      if (retryCount > 5) {
        debug('interval in retryable in setPropertyNowRetryable', this.getDevName(deviceId), 'Clear IP address');
        this.getDev(deviceId).hasLoadedTuyaIP = false;
        this.getDevTuya(deviceId).disconnect();
        delete this.getDevTuya(deviceId).device.ip;
      }
      return 250 * retryCount;
    };
    // eslint-disable-next-line new-cap
    const retryable = new async.retryable({ times: 7, interval }, (callback) => {
      debug('call retryable in setPropertyNowRetryable', this.getDevName(deviceId), 'index', index, '<=', newValue);
      this.setPropertyNow(deviceId, index, newValue)
        .then(result => callback(null, result))
        .catch(error => callback(error));
    });
    return new Promise((resolve, reject) => {
      debug('call setPropertyNowRetryable', this.getDevName(deviceId), 'index', index, '<=', newValue);
      retryable((error, achema) => {
        if (error) {
          reject(error);
        } else {
          resolve(achema);
        }
      });
    });
  }

  async setPropertyNow(deviceId, index, newValue) {
    return new Promise((resolve, reject) => {
      debug('call setPropertyNow', this.getDevName(deviceId), 'index', index, '<=', newValue);
      this.getHandle(deviceId)
        .then(handle => {
          try {
            handle.set({ dps: index.toString(), set: newValue })
              .then((result) => {
                debug('setPropertyNow', this.getDevName(deviceId), 'result', result);
                if (result) {
                  setTimeout(() => {
                    this.getProperty(deviceId, index)
                      .then((value) => {
                        if (value === newValue) {
                          resolve(result);
                        } else {
                          reject(new Error('setPropertyNow ineffective, newValue doesn\'t set', newValue, '=>', value));
                        }
                      })
                      .catch(error => reject(error));
                  }, this.getDev(deviceId).onPropertyDelay);
                } else {
                  reject(new Error('setPropertyNow result failed', this.getDevName(deviceId), 'index', index, '<=', newValue));
                }
                resolve(result);
              })
              .catch((error) => {
                // debug('setPropertyNow', this.getDevName(deviceId), 'error', error.message, 'Clear IP address');
                // this.getDev(deviceId).hasLoadedTuyaIP = false;
                // delete this.getDevTuya(deviceId).device.ip;
                reject(error);
              });
          } catch (error) {
            reject(error);
          } 
        })
    });
  }

  async setPropertyDebounce(deviceId, index, newValue) {
    debug('call setPropertyDebounce', this.getDevName(deviceId), index, newValue);
    this.nextSetProperty(deviceId, index, newValue);
    return true;
  }

  nextSetProperty(deviceId, index, newValue) {
    const setProp = { task: this.setPropertyNow, args: [deviceId, index, newValue] };
    debug('call nextSetProperty', this.getDevName(deviceId), setProp);
    let setPropSubject = this.getDev(deviceId).setPropSubjects[index]; // separate subject for every dps index
    if (!setPropSubject) {
      debug('nextSetProperty - create new Subject');
      const debounce = this.getDev(deviceId).onPropertyDelay + 100;
      debug('nextSetProperty - create new Subject with debounceTime', debounce);
      setPropSubject = new Subject();
      this.getDev(deviceId).setPropSubjects[index] = setPropSubject;
      setPropSubject.pipe(
        debounceTime(debounce),
      ).subscribe((set) => {
        debug('subscribe in nextSetProperty', this.getDevName(deviceId), set);
        set.task.call(this, ...set.args);
      });
    }
    setPropSubject.next(setProp);
  }

  //
  // Remove after end of implementing TuyaLightBulb
  //
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
      this.nextSetProperty(deviceId, dps, { task: this.setBright, args: [bright] });
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
      this.nextSetProperty(deviceId, dps, { task: this.setTemp, args: [temp] });
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
      result = await this.setProperty(deviceId, dps, 'colour');
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
