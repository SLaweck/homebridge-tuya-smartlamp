
const TuyaAccessory = require('../lib/TuyaAccessory');
const homebridgeLib = require('homebridge-lib');
const fakegatoHistory = require('fakegato-history');
const fs = require('fs');
const path = require('path');
const debug = require('debug')('TuyaOutlet');

const kHour = 60 * 60 * 1000;

class TuyaOutlet extends TuyaAccessory {
    constructor(config, resolver, log, hb) {
        super(config, resolver, log, hb);
        this.isMonitoring = this.config.type.includes('monitoring');
        this.interval = config.interval ? config.interval * 1000 : null;
        this.dpsOnOff = 1;
        this.dpsAmperes = 4;
        this.dpsWatts = 5;
        this.dpsVolts = 6;
        this.HistoryService = hb ? fakegatoHistory(hb) : null;
        this.historyFilename = `history_${this.config.devId}.json`;
    }
    log(...args) {
        this.hblog('[TO]', ...args);
    }
    error(...args) {
        if (this.config.logErrors) {
            this.hblog.error('[TO] Error:', ...args);
        } else {
            this.debug('ERROR:', ...args);
        }
    }

    getDeviceService() {
        this.debug('getDeviceService');
        if (this.deviceServices != null) {
            return this.deviceServices;
        }
    
        this.deviceServices = [];
    
        const deviceService = new this.Service.Outlet(this.config.name);
        this.deviceServices.push(deviceService);

        const onCharacteristic = deviceService.getCharacteristic(this.Characteristic.On)
            .on('get', callback => this.getOnOff(this.dpsOnOff, callback))
            .on('set', (onOff, callback) => this.setOnOff(this.dpsOnOff, onOff, callback));
        const inUseCharacteristic = deviceService.getCharacteristic(this.Characteristic.OutletInUse)
            .on('get', this.getInUse.bind(this));
      
        if (this.isMonitoring) {
            const Eve = new homebridgeLib.EveHomeKitTypes(this.hb);
            deviceService.addOptionalCharacteristic(Eve.Characteristics.Voltage);
            deviceService.addOptionalCharacteristic(Eve.Characteristics.ElectricCurrent);
            deviceService.addOptionalCharacteristic(Eve.Characteristics.CurrentConsumption);
            const voltageCharacteristic = deviceService.getCharacteristic(Eve.Characteristics.Voltage)
                .on('get', this.getVoltage.bind(this));
            const currentCharacteristic = deviceService.getCharacteristic(Eve.Characteristics.ElectricCurrent)
                .on('get', this.getCurrent.bind(this));
            const consumptionCharacteristic = deviceService.getCharacteristic(Eve.Characteristics.CurrentConsumption)
                .on('get', this.getConsumption.bind(this));

            if (this.interval) {
                let [totalConsumption, resetTotal] = this.readTotalConsumption();
                this.debug('readed totalConsumption & resetTotal', totalConsumption, resetTotal);
                deviceService.addOptionalCharacteristic(Eve.Characteristics.TotalConsumption);
                const totalConsumptionCharacteristic = deviceService.getCharacteristic(Eve.Characteristics.TotalConsumption)
                    .on('get', callback => callback(null, totalConsumption));

                const historyService = new this.HistoryService('energy', this, {
                    disableTimer: false,
                    storage: 'fs',
                    filename: this.historyFilename,
                });
                this.deviceServices.push(historyService);
                historyService.addOptionalCharacteristic(Eve.Characteristics.ResetTotal);
                const resetTotalCharacteristic = historyService.getCharacteristic(Eve.Characteristics.ResetTotal)
                    .on('get', callback => callback(null, resetTotal))
                    .on('set', (reset, callback) => {
                        this.debug('reset totalConsumption');
                        resetTotal = reset;
                        totalConsumption = 0.0;
                        callback(null, resetTotal);
                    });
          
                let lastTime = new Date().getTime();
                const updateValues = () => setTimeout(async () => {
                    this.debug('update characteristics values');
                    try {
                        const [onOff, inUse, amperes, watts, volts] = await this.getValues();
                        if (watts !== undefined) {
                            const now = new Date().getTime();
                            historyService.addEntry({ time: now / 1000, power: watts });
                            const delta = (now - lastTime) / 1000;
                            lastTime = now;
                            const consumption = watts * delta; // W/s
                            totalConsumption += consumption / kHour;
                        }

                        this.debug('update totalConsumption', totalConsumption);
                        onCharacteristic.updateValue(onOff);
                        inUseCharacteristic.updateValue(inUse);
                        voltageCharacteristic.updateValue(volts);
                        currentCharacteristic.updateValue(amperes);
                        consumptionCharacteristic.updateValue(watts);
                        totalConsumptionCharacteristic.updateValue(totalConsumption);

                        const extra = historyService.getExtraPersistedData();
                        if (!extra) {
                            this.historyService.setExtraPersistedData({ totalConsumption, resetTotal });
                        } else if (extra.totalConsumption !== totalConsumption || extra.resetTotal !== resetTotal) {
                            extra.totalConsumption = totalConsumption;
                            extra.resetTotal = resetTotal;
                            historyService.setExtraPersistedData(extra);
                        }
                    } catch(error) {
                        this.error('update values error', error);
                    }
                    updateValues();
                }, this.interval);
                updateValues();
            }
        }
    
        return this.deviceServices;
    }

    readTotalConsumption() {
        const filepath = this.hb ? this.hb.user.storagePath() : './config';
        const filename = path.join(filepath, this.historyFilename);
        const data = fs.readFileSync(filename, 'utf8');
        const jsonData = typeof (data) === 'object' ? data : JSON.parse(data);
        const totalConsumption = jsonData.extra && jsonData.extra.totalConsumption ? jsonData.extra.totalConsumption : 0;
        const resetTotal = jsonData.extra && jsonData.extra.resetTotal ? jsonData.extra.resetTotal : 0; // Math.floor(Date.now() / 1000) - 978307200  // seconds since 01.01.2001
        this.debug('readTotalConsumption', totalConsumption, resetTotal);
        return [totalConsumption, resetTotal];
    }

    getValues() {
        return new Promise(async (resolve, reject) => {
            this.getProperties([this.dpsOnOff, this.dpsAmperes, this.dpsWatts, this.dpsVolts]).then(([onOff, amperes, watts, volts]) => {
                const inUse = onOff && amperes > 0;
                const a = amperes / 1000;
                const w = watts / 10;
                const v = volts / 10;
                this.debug('getValues:', inUse ? 'in use' : 'not in use', a, 'A', w, 'W', v, 'V');
                resolve([onOff, inUse, a, w, v]);
            }).catch(error => {
                this.error('getting device in use status error', error);
                reject(error);
            });
        });
    }

    getInUse(callback = () => {}) {
        this.getProperties([this.dpsOnOff, this.dpsAmperes]).then(props => {
            const inUse = props[0] && props[1] > 0;
            this.debug('device is', inUse ? 'in use' : 'not in use');
            callback(null, inUse);
        }).catch(error => {
            this.error('getting device in use status error', error);
            callback(error);
        });
    }

    getCurrent(callback = () => {}) {
        this.getProperty(this.dpsAmperes).then(amperes => {
            const a = amperes / 1000;
            this.debug('device current is', a.toFixed(3), 'A');
            callback(null, a);
        }).catch(error => {
            this.error('getting device current error', error);
            callback(error);
        });
    }

    getConsumption(callback = () => {}) {
        this.getProperty(this.dpsWatts).then(watts => {
            const w = watts / 10;
            this.debug('device consumption is', w.toFixed(1), 'W');
            callback(null, w);
        }).catch(error => {
            this.error('getting device consumption error', error);
            callback(error);
        });
    }

    getVoltage(callback = () => {}) {
        this.getProperty(this.dpsVolts).then(volts => {
            const v = volts / 10;
            this.debug('device voltage is', v.toFixed(1), 'V');
            callback(null, v);
        }).catch(error => {
            this.error('getting device voltage error', error);
            callback(error);
        });
    }

    getVA(callback = () => {}) {
        this.getProperties([this.dpsAmperes, this.dpsVolts]).then(([amperes, volts]) => {
            const a = amperes / 1000;
            const v = volts / 10;
            const va = v * a;
            this.debug('device volto-amperes is', va.toFixed(3), 'VA');
            callback(null, va);
        }).catch(error => {
            this.error('getting device volto-amperes error', error);
            callback(error);
        });
    }    
}

module.exports = TuyaOutlet;
