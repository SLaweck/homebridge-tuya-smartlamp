
const TuyaDevice = require('tuyapi');
const debug = require('debug')('TuyaAccessory');

const GET_SET_TIMEOUT = 5000;
const CONNECT_TIMEOUT = 3000;

class TuyaAccessory {
    constructor(config, resolver, log, hb = null) {
        debug('configure device', config);
        this.hblog = log;
        this.config = config;
        this.resolver = resolver;
        this.isRequestingSchema = false;
        this.getSchemaQueuedPromises = [];
          this.tuya = new TuyaDevice({ id: config.devId, key: config.localKey, ip: config.ip });
        this.tuya.on('connected', () => {
            this.debug('Device onConneted: connected =', this.tuya.isConnected());
            // this.connect();
        });
        this.tuya.on('disconnected', () => {
            this.debug('Device onDisconneted: connected =', this.tuya.isConnected());
            // this.connect();
        });
        this.tuya.on('error', error => {
            this.debug('Device onError:', error);
            // this.connect(true);
            // reject('connect error', 'this.connect(true)');
        });
        this.hb = hb;
        this.Service = hb ? hb.hap.Service : null;
        this.Characteristic = hb ? hb.hap.Characteristic : null;
    }
    debug(...args) {
        debug('[' + this.config.name + ']', ...args);
    }
    log(...args) {
        this.hblog('[TA]', ...args);
    }
    error(...args) {
        if (this.config.logErrors) {
            this.hblog.error('[TA] Error:', ...args);
        } else {
            this.debug('ERROR:', ...args);
        }
    }
    connect(resetIP = false) {
        return new Promise(async (resolve, reject) => {
            this.debug('call connect', resetIP ? 'with reset IP': '');
            if (!resetIP && this.tuya.isConnected()) {
                resolve(true);
            } else {
                // this.tuya.disconnect();
                this.debug('call resolver for id:', this.config.devId);
                const device = await this.resolver.resolve(this.config.devId);
                this.debug('resolver answer:', device);
                if (device) {
                    this.log('IP address resolved', device.ip);
                    this.tuya.device.ip = device.ip;
                    // const t = setTimeout(() => {
                    //     this.error('connect timeout - no connection with device within', CONNECT_TIMEOUT, 'ms, force disconnect');
                    //     this.resolver.clear(this.config.devId);
                    //     if (this.tuya.isConnected()) {
                    //         this.tuya._
                    //         this.tuya.disconnect();
                    //     }
                    //     reject('timeout error');
                    // }, GET_SET_TIMEOUT);
                    this.tuya.connect().then(() => {
                        // clearTimeout(t);
                        this.log('Device connected');
                        resolve(true);
                    }).catch(error => {
                        // clearTimeout(t);
                        this.error('Device connect error:', error);
                        reject('device connect error: ' + error);
                    });
                } else {
                    this.error('Device not found');
                    reject('device not found');
                }
            }
        });
    }
    getSchema() {
        return new Promise(async (resolve, reject) => {
            this.debug('call getSchema');
            if (this.isRequestingSchema) {
                this.debug('getSchema is requesting - add to promise queue')
                this.getSchemaQueuedPromises.push({
                    resolve,
                    reject
                });
            } else {
                this.isRequestingSchema = true;
                const t = setTimeout(() => {
                    this.error('getSchema timeout - no answer from device within', GET_SET_TIMEOUT, 'ms');
                    if (this.tuya.isConnected()) {
                        this.log('Connection problem - force device disconnect');
                        this.resolver.clear(this.config.devId);
                        this.tuya._connected = false;
                        setTimeout(() => this.tuya.disconnect(), 1);
                    }
                    reject('timeout error');
                    this.getSchemaQueuedPromises.forEach((callback) => {
                        callback.reject('timeout error');
                    });
                    this.getSchemaQueuedPromises = [];
                    this.isRequestingSchema = false;
                }, GET_SET_TIMEOUT);
                this.connect().then(async () => {
                    this.tuya.get({ schema: true }).then(schema => {
                        clearTimeout(t);
                        this.debug('getSchema =>', schema);
                        resolve(schema);
                        this.getSchemaQueuedPromises.forEach((callback) => {
                            callback.resolve(schema);
                        });
                        this.getSchemaQueuedPromises = [];
                        this.isRequestingSchema = false;
                    }).catch(error => {
                        clearTimeout(t);
                        reject(error);
                        this.getSchemaQueuedPromises.forEach((callback) => {
                            callback.reject(error);
                        });
                        this.getSchemaQueuedPromises = [];
                        this.isRequestingSchema = false;
                    });
                }).catch(error => {
                    reject(error);
                    this.getSchemaQueuedPromises.forEach((callback) => {
                        callback.reject(error);
                    });
                    this.getSchemaQueuedPromises = [];
                    this.isRequestingSchema = false;
                });
            }
        });
    }
    getProperty(dps) {
        return new Promise((resolve, reject) => {
            this.debug('call getProperty', dps);
            this.getSchema().then(schema => {
                if (schema.devId === this.config.devId && schema.dps) {
                    if (schema.dps[dps] !== undefined) {
                        this.debug('getProperty', dps, '=>', schema.dps[dps]);
                        resolve(schema.dps[dps]);
                    } else {
                        this.error('Property not found');
                        reject('property not found');                        
                    }
                } else {
                    this.error('Problem with getted schema', schema);
                    reject('schema problem');
                }
            }).catch(
                error => reject(error)
            )
        });
    }
    getProperties(dps) {
        return new Promise((resolve, reject) => {
            this.debug('call getProperties', dps);
            this.getSchema().then(schema => {
                if (schema.devId === this.config.devId && schema.dps) {
                    try {
                        const props = dps.map(d => schema.dps[d])
                        this.debug('getProperties', dps, '=>', props);
                        resolve(props)
                    } catch (error) {
                        this.error('Some properties not found', error);
                        reject('some properties not found');                        
                    }
                } else {
                    this.error('Problem with getted schema', schema);
                    reject('schema problem');
                }
            }).catch(
                error => reject(error)
            )
        });
    }
    setProperty(dps, value) {
        return new Promise((resolve, reject) => {
            this.debug('call setProperty', dps, '<=', value);
            this.connect().then(async () => {
                const t = setTimeout(() => {
                    this.error('setProperty', dps, '<=', value, 'timeout - no answer from device within', GET_SET_TIMEOUT, 'ms');
                    if (this.tuya.isConnected()) {
                        this.log('Connection problem - force device disconnect');
                        this.resolver.clear(this.config.devId);
                        this.tuya._connected = false;
                        setTimeout(() => this.tuya.disconnect(), 1);
                    }
                    reject('timeout error');
                }, GET_SET_TIMEOUT);
                this.tuya.set({ dps: dps.toString(), set: value }).then(result => {
                    clearTimeout(t);
                    this.debug('setProperty', result);
                    resolve(result);
                }).catch(error => {
                    clearTimeout(t);
                    reject(error);
                });
            }).catch(
                error => reject(error)
            );
        });
    }

    getInformationService() {
        this.debug('call getInformationService');
        if (this.informationService != null || !this.hb) {
            return this.informationService;
        }
    
        const informationService = new this.Service.AccessoryInformation();
    
        informationService
            .setCharacteristic(this.Characteristic.Manufacturer, this.config.manufacturer || 'Tuya [SLaweck]')
            .setCharacteristic(this.Characteristic.Model, this.config.model || 'Smart device')
            .setCharacteristic(this.Characteristic.SerialNumber, this.config.devId.slice(8));
    
        this.informationService = informationService;
        return informationService;
    }
    getDeviceService() {
        this.debug('call getDeviceService');
        if (this.deviceServices != null || !this.hb) {
            return this.deviceServices;
        }
    
        this.deviceServices = [];
    
        const deviceService = new this.Service.Switch(this.config.name);
        const onCharacteristic = deviceService.getCharacteristic(this.Characteristic.On)
            .on('get', callback => this.getOnOff(1, callback))
            .on('set', (onOff, callback) => this.setOnOff(1, onOff, callback));

        this.deviceServices.push(deviceService);
    
        return this.deviceServices;
    }

    getOnOff(dps, callback = () => {}) {
        this.debug('call getOnOff', dps);
        this.getProperty(dps).then(onOff => {
            this.debug('device' + (dps !== 1 ? ' [' + dps + ']' : ''), 'is', onOff ? 'on' : 'off');
            callback(null, onOff);
        }).catch(error => {
            this.error('getting on/off status error', dps !== 1 ? '[' + dps + ']' : '', error);
            callback(error);
        });
    }
    setOnOff(dps, onOff, callback = () => {}) {
        this.debug('call setOnOff', dps, '<=', onOff);
        this.setProperty(dps, onOff).then(result => {
            this.debug('device' + (dps !== 1 ? ' [' + dps + ']' : ''), 'set', onOff ? 'on' : 'off', result ? 'success' : 'fail');
            callback(null, result);
        }).catch(error => {
            this.error('setting on/off status error', dps !== 1 ? '[' + dps + ']' : '', error);
            callback(error);
        });
    }
}

module.exports = TuyaAccessory;

/*
        return new Promise((resolve, reject) => {});
*/
