const fs = require('fs');
const path = require('path');
const fakegatoHistory = require('fakegato-history');
const debug = require('debug')('TuyaOutlet');
const [getCustomCharacteristics, getOrAddCharacteristic] = require('./homekit');

const kHour = 60 * 60 * 1000;

let logError;

class TuyaOutlet {
  constructor(tuyaAccessory, config, homebridge) {
    debug('constructor', config);
    this.tuya = tuyaAccessory;
    this.tuyaDev = tuyaAccessory.getDev(config.devId);
    this.log = this.tuyaDev.log;
    this.config = config;
    this.homebridge = homebridge;
    this.Service = homebridge ? homebridge.hap.Service : null;
    this.Characteristic = homebridge ? homebridge.hap.Characteristic : null;
    this.HistoryService = homebridge ? fakegatoHistory(homebridge) : null;
    this.devId = config.devId;
    this.name = config.name;
    this.displayName = this.name;
    this.isMonitoring = this.config.type.includes('monitoring');
    this.interval = config.interval ? config.interval * 1000 : null;
    this.dpsOnOff = 1;
    this.dpsAmperes = 4;
    this.dpsWatts = 5;
    this.dpsVolts = 6;
    if (config.logErrors) {
      logError = this.log ? (...args) => this.log.error('[TO]', ...args) : debug;
    } else {
      logError = debug;
    }
    debug('constructor end', logError);
  }

  getInformationService() {
    debug('getInformationService');
    if (this.informationService != null) {
      return this.informationService;
    }

    const informationService = new this.Service.AccessoryInformation();

    informationService
      .setCharacteristic(this.Characteristic.Manufacturer, this.config.manufacturer)
      .setCharacteristic(this.Characteristic.Model, this.config.model)
      .setCharacteristic(this.Characteristic.SerialNumber, this.config.devId.slice(8));

    this.informationService = informationService;
    return informationService;
  }

  getDeviceService() {
    debug('getDeviceService');
    if (this.deviceService != null) {
      return this.deviceService;
    }

    const deviceService = new this.Service.Outlet(this.name);

    const onCharacteristic = deviceService.getCharacteristic(this.Characteristic.On)
      .on('get', this.getOnOff.bind(this))
      .on('set', this.setOnOff.bind(this));
    const inUseCharacteristic = deviceService.getCharacteristic(this.Characteristic.OutletInUse)
      .on('get', this.getInUse.bind(this));

    if (this.isMonitoring) {
      const CustomCharacteristic = getCustomCharacteristics(this.homebridge);

      this.voltageCharacteristic = getOrAddCharacteristic(deviceService, CustomCharacteristic.Voltage)
        .on('get', this.getVoltage.bind(this));
      this.currentCharacteristic = getOrAddCharacteristic(deviceService, CustomCharacteristic.Current)
        .on('get', this.getCurrent.bind(this));
      this.consumptionCharacteristic = getOrAddCharacteristic(deviceService, CustomCharacteristic.Consumption)
        .on('get', this.getConsumption.bind(this));

      if (this.interval) {
        let totalConsumption = 0;
        this.totalConsumptionCharacteristic = getOrAddCharacteristic(deviceService, CustomCharacteristic.TotalConsumption)
          .on('get', callback => callback(null, totalConsumption));
        // Initialize history service
        this.historyService = new this.HistoryService('energy', this, { // { displayName: this.name }
          disableTimer: false,
          storage: 'fs',
          filename: `history_${this.devId}.json`,
        });
        // Add history total consumption to total consumption
        this.calculateTotalConsumption((historyTotal) => { totalConsumption += historyTotal; });
        let lastTime = new Date().getTime();
        // Function for counting total consumption, adding consumption to history and updating characteristics values
        const update = () => setTimeout(() => {
          debug('update characteristics');
          this.getOnOff((error, onOff) => !error && onCharacteristic.updateValue(onOff));
          this.getInUse((error, inUse) => !error && inUseCharacteristic.updateValue(inUse));
          this.getVoltage((error, volts) => !error && this.voltageCharacteristic.updateValue(volts));
          this.getCurrent((error, amperes) => !error && this.currentCharacteristic.updateValue(amperes));
          this.getConsumption((error, watts) => {
            if (!error && !Number.isNaN(watts)) {
              const now = new Date().getTime();
              this.historyService.addEntry({ time: now / 1000, power: watts });
              this.consumptionCharacteristic.updateValue(watts);
              const delta = (now - lastTime) / 1000;
              lastTime = now;
              const consumption = watts * delta; // W/s
              totalConsumption += consumption / kHour;
              debug('TotalConsumption', totalConsumption);
              this.totalConsumptionCharacteristic.updateValue(totalConsumption);
              const extra = this.historyService.getExtraPersistedData();
              if (!extra) {
                this.historyService.setExtraPersistedData({ totalConsumption });
              } else if (extra.totalConsumption < totalConsumption) {
                extra.totalConsumption = totalConsumption;
                this.historyService.setExtraPersistedData(extra);
              }
            } else if (error) {
              logError('update consumtion error', error.message);
            }
          });
          update();
        }, this.interval);
        update();
      }
    }

    this.deviceService = deviceService;
    const services = this.historyService ? [deviceService, this.historyService] : [deviceService];
    return services;
  }

  calculateTotalConsumption(callback) {
    let lastTime;
    let totalConsumption = 0;
    const countTotalConsumption = (json) => {
      lastTime = json.initialTime;
      const {
        firstEntry, lastEntry, usedMemory, extra,
      } = json;
      if (extra && extra.totalConsumption) {
        debug('get totalConsumption from extra', extra);
        ({ totalConsumption } = extra);
      } else {
        debug('calcultae totalConsumption from history', extra);
        for (let i = firstEntry; i < lastEntry; i++) {
          const entry = json.history[i % usedMemory];
          // debug('history', entry);
          if (typeof entry === 'object') {
            if (entry.time && entry.power !== undefined) {
              const now = entry.time;
              const watts = entry.power || 0;
              const delta = now - lastTime;
              const consumption = watts * delta;
              totalConsumption += consumption / kHour;
              if (Number.isNaN(consumption / kHour)) {
                debug('history totalConsumption', totalConsumption, now, watts, delta, consumption, consumption / kHour);
              }
              lastTime = now;
            }
          }
        }
      }
      this.log('history total consumption', totalConsumption);
      callback(totalConsumption);
    };
    const filepath = this.homebridge ? this.homebridge.user.storagePath() : './config';
    const filename = path.join(filepath, `history_${this.devId}.json`);
    fs.readFile(filename, 'utf8', (error, data) => {
      if (!error && data) {
        const jsonFile = typeof (data) === 'object' ? data : JSON.parse(data);
        countTotalConsumption(jsonFile);
      } else if (error) {
        logError('read history file error', error.message);
      }
    });
  }

  getOnOff(callback = () => {}) {
    this.tuya.getProperty(this.devId, this.dpsOnOff)
      .then((onOff) => {
        debug(this.name, 'is', onOff ? 'on' : 'off');
        callback(null, onOff);
      })
      .catch((error) => {
        // logError('getting on/off status error', error.message);
        callback(error);
      });
  }

  setOnOff(onOff, callback = () => {}) {
    this.tuya.setProperty(this.devId, this.dpsOnOff, onOff)
      .then((result) => {
        debug(this.name, 'set', onOff ? 'on' : 'off', result ? 'success' : 'fail');
        callback(null, result);
      })
      .catch((error) => {
        logError('setting turn', onOff ? 'on' : 'off', 'error', error.message);
        callback(error);
      });
  }

  getInUse(callback = () => {}) {
    this.tuya.getProperties(this.devId, [this.dpsOnOff, this.dpsAmperes])
      .then((props) => {
        const inUse = props[0] && props[1] > 0;
        debug(this.name, 'is', inUse ? 'in use' : 'not in use');
        callback(null, inUse);
      })
      .catch((error) => {
        // logError('getting in use status error', error.message);
        callback(error);
      });
  }

  getCurrent(callback = () => {}) {
    this.tuya.getProperty(this.devId, this.dpsAmperes)
      .then((amperes) => {
        const a = amperes / 1000;
        debug(this.name, 'current is', a.toFixed(3), 'A');
        callback(null, a);
      })
      .catch((error) => {
        // logError('getting current error', error.message);
        callback(error);
      });
  }

  getConsumption(callback = () => {}) {
    this.tuya.getProperty(this.devId, this.dpsWatts)
      .then((watts) => {
        const w = watts / 10;
        debug(this.name, 'consumption is', w.toFixed(1), 'W');
        callback(null, w);
      })
      .catch((error) => {
        // logError('getting consumption error', error.message);
        callback(error);
      });
  }

  getVoltage(callback = () => {}) {
    this.tuya.getProperty(this.devId, this.dpsVolts)
      .then((volts) => {
        const v = volts / 10;
        debug(this.name, 'voltage is', v.toFixed(1), 'V');
        callback(null, v);
      })
      .catch((error) => {
        // logError('getting voltage error', error.message);
        callback(error);
      });
  }

  getVA(callback = () => {}) {
    this.tuya.getProperties(this.devId, [this.dpsAmperes, this.dpsVolts])
      .then(([amperes, volts]) => {
        const a = amperes / 1000;
        const v = volts / 10;
        const va = v * a;
        debug(this.name, 'volto-amperes is', va.toFixed(3), 'VA');
        callback(null, va);
      })
      .catch((error) => {
        // logError('getting volto-amperes error', error.message);
        callback(error);
      });
  }
}

module.exports = TuyaOutlet;
