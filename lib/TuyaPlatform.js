// const TuyaAccessory = require('./TuyaAccessory');

let Accessory;
// eslint-disable-next-line no-unused-vars
let Service;
// eslint-disable-next-line no-unused-vars
let Characteristic;
// eslint-disable-next-line no-unused-vars
let UUIDGen;

class TuyaPlatform {
  constructor(log, config, api) {
    // super(log, config);
    log('TujaPlatform Init', log, config);
    this.log = log;
    this.config = config;
    this.api = api;
    this.accessories = {};
    log(Accessory);
  }
}

// module.exports = (homebridge) => {
//   ({ Service } = homebridge.hap);
//   ({ Characteristic } = homebridge.hap);
//   return TuyaHomeKit;
// };

module.exports = (homebridge) => {
  // eslint-disable-next-line no-console
  console.log(`homebridge API version: ${homebridge.version}`);
  // Accessory must be created from PlatformAccessory Constructor
  Accessory = homebridge.platformAccessory;
  // Service and Characteristic are from hap-nodejs
  ({ Service } = homebridge.hap);
  ({ Characteristic } = homebridge.hap);
  UUIDGen = homebridge.hap.uuid;
  // For platform plugin to be considered as dynamic platform plugin,
  // registerPlatform(pluginName, platformName, constructor, dynamic), dynamic must be true
  // homebridge.registerPlatform('homebridge-TuyaPlatform', 'TuyaPlatform', TuyaPlatform, true);
  return TuyaPlatform;
};
