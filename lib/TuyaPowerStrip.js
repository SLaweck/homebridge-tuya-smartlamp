
const TuyaAccessory = require('../lib/TuyaAccessory');
const debug = require('debug')('TuyaPowerStrip');

class TuyaPowerStrip extends TuyaAccessory {
    constructor(config, resolver, log, hb) {
        super(config, resolver, log, hb);
    }
    log(...args) {
        this.hblog('[TPS]', ...args);
    }
    error(...args) {
        if (this.config.logErrors) {
            this.hblog.error('[TPS] Error:', ...args);
        } else {
            this.debug('ERROR:', ...args);
        }
    }

    getDeviceService() {
        this.debug('call getDeviceService');
        if (this.deviceServices != null) {
            return this.deviceServices;
        }
    
        this.deviceServices = [];
    
        for (let i = 0; i < this.config.switchNames.length && i < this.config.switchDPSs.length; i++) {
            const name = this.config.switchNames[i];
            const dps = this.config.switchDPSs[i];
    
            const deviceService = new this.Service.Switch(this.config.name + ' ' + name, name);
            const onCharacteristic = deviceService.getCharacteristic(this.Characteristic.On)
                .on('get', callback => this.getOnOff(dps, callback))
                .on('set', (onOff, callback) => this.setOnOff(dps, onOff, callback));
    
            this.deviceServices.push(deviceService);
        }
    
        return this.deviceServices;
    }
}

module.exports = TuyaPowerStrip;
