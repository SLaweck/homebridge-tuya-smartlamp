const { inherits } = require('util');


const getCustomCharacteristics = (homebridge) => {
  const { Characteristic } = homebridge.hap;

  const CustomCharacteristic = {};

  // eslint-disable-next-line func-names
  CustomCharacteristic.Voltage = function () {
    Characteristic.call(this, 'Voltage', CustomCharacteristic.Voltage.UUID);
    this.setProps({
      format: Characteristic.Formats.FLOAT,
      unit: 'V',
      // minValue: 0,
      // maxValue: 65535,
      // minStep: 0.1,
      perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY],
    });
    this.value = this.getDefaultValue();
  };
  CustomCharacteristic.Voltage.UUID = 'E863F10A-079E-48FF-8F27-9C2605A29F52';
  inherits(CustomCharacteristic.Voltage, Characteristic);

  // eslint-disable-next-line func-names
  CustomCharacteristic.Current = function () {
    Characteristic.call(this, 'Current', CustomCharacteristic.Current.UUID);
    this.setProps({
      format: Characteristic.Formats.FLOAT,
      unit: 'A',
      // minValue: 0,
      // maxValue: 65535,
      // minStep: 0.001,
      perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY],
    });
    this.value = this.getDefaultValue();
  };
  CustomCharacteristic.Current.UUID = 'E863F126-079E-48FF-8F27-9C2605A29F52';
  inherits(CustomCharacteristic.Current, Characteristic);

  // eslint-disable-next-line func-names
  CustomCharacteristic.Consumption = function () {
    Characteristic.call(this, 'Consumption', CustomCharacteristic.Consumption.UUID);
    this.setProps({
      format: Characteristic.Formats.FLOAT,
      unit: 'W',
      // minValue: 0,
      // maxValue: 65535,
      // minStep: 0.1,
      perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY],
    });
    this.value = this.getDefaultValue();
  };
  CustomCharacteristic.Consumption.UUID = 'E863F10D-079E-48FF-8F27-9C2605A29F52';
  inherits(CustomCharacteristic.Consumption, Characteristic);

  // eslint-disable-next-line func-names
  CustomCharacteristic.VoltAmperes = function () {
    Characteristic.call(this, 'Apparent Power', CustomCharacteristic.VoltAmperes.UUID);
    this.setProps({
      format: Characteristic.Formats.UINT16,
      unit: 'VA',
      minValue: 0,
      maxValue: 65535,
      minStep: 1,
      perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY],
    });
    this.value = this.getDefaultValue();
  };
  CustomCharacteristic.VoltAmperes.UUID = 'E863F110-079E-48FF-8F27-9C2605A29F52';
  inherits(CustomCharacteristic.VoltAmperes, Characteristic);

  // eslint-disable-next-line func-names
  CustomCharacteristic.TotalConsumption = function () {
    Characteristic.call(this, 'Total Consumption', CustomCharacteristic.TotalConsumption.UUID);
    this.setProps({
      format: Characteristic.Formats.FLOAT,
      unit: 'kWh',
      // minValue: 0,
      // maxValue: 65535,
      // minStep: 0.000001,
      perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY],
    });
    this.value = this.getDefaultValue();
  };
  CustomCharacteristic.TotalConsumption.UUID = 'E863F10C-079E-48FF-8F27-9C2605A29F52';
  inherits(CustomCharacteristic.TotalConsumption, Characteristic);

  // eslint-disable-next-line func-names
  CustomCharacteristic.KilowattVoltAmpereHour = function () {
    Characteristic.call(this, 'Apparent Energy', CustomCharacteristic.KilowattVoltAmpereHour.UUID);
    this.setProps({
      format: Characteristic.Formats.UINT32,
      unit: 'kVAh',
      minValue: 0,
      maxValue: 65535,
      minStep: 1,
      perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY],
    });
    this.value = this.getDefaultValue();
  };
  CustomCharacteristic.KilowattVoltAmpereHour.UUID = 'E863F127-079E-48FF-8F27-9C2605A29F52';
  inherits(CustomCharacteristic.KilowattVoltAmpereHour, Characteristic);

  // console.log(CustomCharacteristic);
  return CustomCharacteristic;
};

const getOrAddCharacteristic = (service, characteristic) => service.getCharacteristic(characteristic) || service.addCharacteristic(characteristic);

const removeCharacteristicIfFound = (service, characteristic) => {
  if (service.testCharacteristic(characteristic)) {
    const c = service.getCharacteristic(characteristic);
    this.log.warn('Removing stale Characteristic: [%s] [%s]', c.displayName, c.UUID);
    service.removeCharacteristic(c);
  }
};

module.exports = [getCustomCharacteristics, getOrAddCharacteristic, removeCharacteristicIfFound];
