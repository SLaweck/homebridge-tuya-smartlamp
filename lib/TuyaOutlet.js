const fakegatoHistory = require('fakegato-history');
const debug = require('debug')('TuyaOutlet');
const [getCustomCharacteristics, getOrAddCharacteristic] = require('./homekit');

const kHour = 60 * 60 * 1000;

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
    debug('constructor end', this.tuyaDev.log);
  }

  // log(...args) {
  //   this.tuyaDev.log('[TO]', ...args);
  // }

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
        // Function for counting total consumption, adding cunsuption to history and updating characteristics
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
    const countTotalConsumption = () => {
      this.historyService.history.forEach((entry) => {
        // debug('history', entry);
        if (typeof entry === 'object') {
          if (entry.setRefTime) {
            lastTime = entry.time;
          } else {
            const now = entry.time;
            const watts = entry.power || 0;
            const delta = now - lastTime;
            const consumption = watts * delta;
            totalConsumption += consumption / kHour;
            // debug('history totalConsumption', totalConsumption, now, watts, delta, consumption, consumption / kHour);
            lastTime = now;
          }
        }
      });
      this.log('history totalConsumption', totalConsumption);
      callback(totalConsumption);
    };
    setTimeout(() => {
      if (this.historyService.isHistoryLoaded) {
        countTotalConsumption();
      } else {
        this.log('historyService load history');
        this.historyService.load((error, loaded) => {
          if (!error && loaded) {
            this.historyService.loaded = true;
            countTotalConsumption();
          }
        });
      }
    }, 3000);
  }

  getOnOff(callback = () => {}) {
    this.tuya.getProperty(this.devId, this.dpsOnOff)
      .then((onOff) => {
        debug(this.name, 'is', onOff ? 'on' : 'off');
        callback(null, onOff);
      })
      .catch((error) => {
        debug(this.name, 'getting on/off error', error.message);
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
        debug(this.name, 'setting', onOff ? 'on' : 'off', 'error', error.message);
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
        debug(this.name, 'getting in use error', error.message);
        callback(error);
      });
  }

  getCurrent(callback = () => {}) {
    this.tuya.getProperty(this.devId, this.dpsAmperes)
      .then((amperes) => {
        const a = amperes / 1000;
        debug(this.name, 'amperes is', a.toFixed(3));
        callback(null, a);
      })
      .catch((error) => {
        debug(this.name, 'getting amperes error', error.message);
        callback(error);
      });
  }

  getConsumption(callback = () => {}) {
    this.tuya.getProperty(this.devId, this.dpsWatts)
      .then((watts) => {
        const w = watts / 10;
        debug(this.name, 'watts is', w.toFixed(1));
        callback(null, w);
      })
      .catch((error) => {
        debug(this.name, 'getting watts error', error.message);
        callback(error);
      });
  }

  getVoltage(callback = () => {}) {
    this.tuya.getProperty(this.devId, this.dpsVolts)
      .then((volt) => {
        const v = volt / 10;
        debug(this.name, 'volts is', v.toFixed(1));
        callback(null, v);
      })
      .catch((error) => {
        debug(this.name, 'getting volts error', error.message);
        callback(error);
      });
  }
}

module.exports = TuyaOutlet;
