
Homebridge plugin for Tuya/Lohas Led Smart Lamp
===================================

Example `config.json` for Tuya based LED Smart Lamp that support dimmable and changing of color temperature:

    "accessories": [
    	{
            "accessory": "TuyaSmartDevice",
            "name": "Kitchen Light",
            "type": "lightbulb dimmable tunable",
            "manufacturer": "LOHAS",
            "model": "Smart Lamp Multicolor",
            "devId": "XXXXXXXXXX",
            "localKey": "XXXXXXXXXXXXXX",
            "productKey":"IXXXXXXXXXW",
            "brightMin": 11,
            "brightMax": 255
        }
    ]



Example `config.json` for Tuya based multiple LED Smart Lamp, the second one is Multicolor LED RGB Lamp:

    "accessories": [
    	{
            "accessory": "TuyaSmartDevice",
            "name": "Kitchen Light",
            "type": "lightbulb dimmable tunable",
            "manufacturer": "LOHAS",
            "model": "Smart Lamp",
            "devId": "XXXXXXXXXX",
            "localKey": "XXXXXXXXXXXXXX",
            "productKey":"IXXXXXXXXXW",
            "brightMin": 11,
            "brightMax": 255
        },
    	{
            "accessory": "TuyaSmartDevice",
            "name": "Bedroom Light",
            "type": "lightbulb dimmable tunable color",
            "manufacturer": "LOHAS",
            "model": "Smart Lamp Multicolor",
            "devId": "XXXXXXXXXX",
            "localKey": "XXXXXXXXXXXXXX",
            "productKey":"IXXXXXXXXXW",
            "brightMin": 25,
            "brightMax": 255
        },
    ]



To obtain the devId (hint: it has the MAC address in it), the localKey and the productKey, carefully read and review this procedures: [Linking a Tuya Device](https://github.com/codetheweb/tuyapi/blob/master/docs/SETUP.md)

Currently there isn't support for setting colors of Multicolor RGB Lamps. It will be added in the future versions.

Tested on the following LED lights (Non affiliated links following:)
* [LOHAS WiFi A65 B22 Smart Light Bulbs](https://www.amazon.co.uk/gp/product/B0796NLTFT)
* [LOHAS E14 WiFi LED Candle Bulbs](https://www.amazon.co.uk/gp/product/B0796NXVN8)
* [LOHAS Alexa Smart LED WiFi Bulb, R95 B22 Colour Changing Light Bulb](https://www.amazon.co.uk/gp/product/B076HPNHGK)

This plugin should work with any TUYA based LED bulb that can be added to the Tuya, or Smart Life apps or even any Tuya based Samrt Switch (simply set type as an empty string). 
LOHAS is a popular brand and theirs products can you found on [LOHAS Lights](http://www.lohas-led.com/) or on Amazon: [LOHAS Lights on Amazon](https://www.amazon.com/s?ie=UTF8&me=A2X4NE86JUW3T&page=1)


Work in progress...
