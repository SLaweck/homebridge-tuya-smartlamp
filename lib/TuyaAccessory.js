const Tuya = require('tuyapi');
const async = require('async');
const debug = require('debug')('TuyaAccessory');

class TuyaAccessory {
  constructor(log, config) {
    this.log = log;
    this.devices = {};
    config.devices.forEach((device) => {
      const deviceId = device.devId;
      const tuyaDevice = {
        name: device.name,
        serialNumber: deviceId,
        tuya: new Tuya({
          id: deviceId,
          key: device.localKey,
        }),
        isLoadingTuyaIP: false,
        hasLoadedTuyaIP: false,
        getHandleQueuedPromises: [],
        isRequestingSchema: false,
        getSchemaQueuedPromises: [],
      };
      this.devices[deviceId] = tuyaDevice;
    });
    // this.name = config.name;
    // this.serialNumber = config.devId;
    // this.tuya = new Tuya({
    //   // type: 'outlet',
    //   id: config.devId,
    //   // uid: config.uid,
    //   key: config.localKey,
    // });

    // this.isLoadingTuyaIP = false;
    // this.hasLoadedTuyaIP = false;
    // this.getHandleQueuedPromises = [];

    // this.isRequestingSchema = false;
    // this.getSchemaQueuedPromises = [];

    // eslint-disable-next-line new-cap
    this.resolveQueue = new async.queue((task, callback) => task(callback));
    // eslint-disable-next-line new-cap
    this.updateQueue = new async.queue((task, callback) => task(callback));
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
      this.devices[devId].tuya.resolveId()
        .then(() => {
          callback(null, this.devices[devId].tuya);
        })
        .catch((error) => {
          debug(this.devices[devId].name, 'resolve IP error');
          callback(error);
        });
    });
    return new Promise((resolve, reject) => {
      retryable(deviceId, (error, tuya) => {
        // console.log('retryable', tuya, error);
        if (error) {
          reject(error);
        } else {
          this.log(`Resolve ${this.devices[deviceId].name} IP: ${tuya.device.ip}`);
          resolve(tuya);
        }
      });
    });
  }

  async resolveIdNow(deviceId) {
    return new Promise((resolve, reject) => {
      this.devices[deviceId].tuya.resolveId()
        .then(() => {
          resolve(this.devices[deviceId].tuya);
        })
        .catch((error) => {
          reject(error);
        });
    });
  }

  async getHandle(deviceId) {
    return new Promise((resolve, reject) => {
      if (this.devices[deviceId].hasLoadedTuyaIP) {
        resolve(this.devices[deviceId].tuya);
      } else if (this.devices[deviceId].isLoadingTuyaIP) {
        this.devices[deviceId].getHandleQueuedPromises.push({
          resolve,
          reject,
        });
      } else {
        this.devices[deviceId].isLoadingTuyaIP = true;
        this.resolveId(deviceId)
          .then(() => {
            this.devices[deviceId].hasLoadedTuyaIP = true;

            resolve(this.devices[deviceId].tuya);
            this.devices[deviceId].getHandleQueuedPromises.forEach((callback) => {
              callback.resolve(this.devices[deviceId].tuya);
            });
          })
          .catch((error) => {
            reject(error);
            this.devices[deviceId].getHandleQueuedPromises.forEach((callback) => {
              callback.reject(error);
            });
          })
          .then(() => {
            this.devices[deviceId].isLoadingTuyaIP = false;
            this.devices[deviceId].getHandleQueuedPromises = [];
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
      if (this.devices[deviceId].isRequestingSchema) {
        this.devices[deviceId].getSchemaQueuedPromises.push({
          resolve,
          reject,
        });
      } else {
        this.devices[deviceId].isRequestingSchema = true;

        this.getHandle(deviceId)
          .then(handle => handle.get({ schema: true }))
          .then((result) => {
            debug(`Got ${this.devices[deviceId].name} schema with result: ${JSON.stringify(result)}`);
            const { dps } = result;

            resolve(dps);
            this.devices[deviceId].getSchemaQueuedPromises.forEach((callback) => {
              callback.resolve(dps);
            });
          })
          .catch((error) => {
            reject(error);
            this.devices[deviceId].getSchemaQueuedPromises.forEach((callback) => {
              callback.reject(error);
            });
          })
          .then(() => {
            this.devices[deviceId].isRequestingSchema = false;
            this.devices[deviceId].getSchemaQueuedPromises = [];
          });
      }
    });
  }

  async setProperty(deviceId, index, newValue) {
    return new Promise((resolve, reject) => {
      this.updateQueue.push((callback) => {
        this.setPropertyNow(deviceId, index, newValue)
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

  async setPropertyNow(deviceId, index, newValue) {
    return new Promise((resolve, reject) => {
      this.getHandle(deviceId)
        .then(handle => handle.set({ dps: index.toString(), set: newValue }))
        .then(resolve)
        .catch((error) => {
          this.devices[deviceId].hasLoadedTuyaIP = false;
          reject(error);
        });
    });
  }
}

module.exports = TuyaAccessory;
