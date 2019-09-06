
const TuyaDevice = require('tuyapi');
const debug = require('debug')('TuyaResolver');

const FIND_TIMEOUT = 3;

class TuyaResolver {
    constructor() {
        this.resolver = new TuyaDevice({ id: 'x', key: 'xxxxxxxxxxxxxxxx' });
    }
    resolve(id = null) {
        return new Promise(async (resolve, reject) => {
            debug('call resolve', id ? 'for id ' + id : '');
            if (id) {
                let dev = this.resolver.foundDevices.find(d => d && d.id === id);
                if (dev) {
                    debug('device found in cache', dev);
                    resolve(dev);
                } else {
                    await this.find();
                    dev = this.resolver.foundDevices.find(d => d && d.id === id);
                    debug(dev ? 'device found:' : 'device not found', dev ? dev : '');
                    resolve(dev);
                }
            } else {
                await this.find();
                debug('found', this.resolver.foundDevices.length, 'device(s)');
                resolve(this.resolver.foundDevices);
            }
        });
    }
    clear(id) {
        let index = this.resolver.foundDevices.findIndex(d => d && d.id === id);
        if (index > -1) {
            delete this.resolver.foundDevices[index];
        } 
    }
    find() {
        return new Promise(async (resolve, reject) => {
            debug('call find');
            this.resolver.find({ all: true, timeout: FIND_TIMEOUT }).then(
                devices => resolve(true)
            ).catch(
                error => debug('TuyaDevice error:', error, this.resolver)
            );
        });
    }
}

module.exports = TuyaResolver;
