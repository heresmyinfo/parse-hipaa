/* global Parse */
const general = require('./general.js')
const plivo = require('plivo')
const PhloClient = plivo.PhloClient

class PhoneVerification extends Parse.Object {
  constructor () {
    super('PhoneVerification')
  }

  /**
   * @method
   * @description start a verification
   * @class
   * @param {phone} full phone number with country code
   * @memberof PhoneVerification
   */
  static startPhoneVerification (data) {
    console.log('err startPhoneVerification start', data, process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN)
    let { phone } = data
    let phoneVerificationQuery = new Parse.Query('PhoneVerification')
    let E164 = general.normalizePhone(phone)
    console.log('err startPhoneVerification mid', E164)
    phoneVerificationQuery.equalTo('E164', E164)
    return phoneVerificationQuery.first({ useMasterKey: true })
      .then((phone) => {
        let thisPhone = phone
        if (!thisPhone) {
          thisPhone = new PhoneVerification()
          thisPhone.set('E164', E164)
        }
        thisPhone.set('code2FA', general.getNew2FACode())
        return thisPhone.save(null, { useMasterKey: true })
      })
      .then((thisPhone) => {
        const plivoClient = new PhloClient(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN)
        console.log('err startPhoneVerification mid - ', process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN)
        return plivoClient
          .phlo('dbeea8b4-a177-4858-b51d-f31667d6dcad')
          .run({ to: E164, code: thisPhone.get('code2FA') })
      })
      .then((data) => {
        console.log('startPhoneVerification sent success ', data)
        return true
      })
      .catch((err) => {
        console.log('err startPhoneVerification sent ', err)
        return false
      })
  }

  static verifyPhone (data) {
    let { countryCode, phone, token } = data

    console.log(' verifyPhone start ', data)

    let phoneVerificationQuery = new Parse.Query('PhoneVerification')
    let E164 = general.normalizePhone(phone)
    console.log('verifyPhone phone, ', E164)
    phoneVerificationQuery.equalTo('E164', E164)
    return phoneVerificationQuery.first({ useMasterKey: true })
      .then((phone) => {
        if (phone) {
          console.log('verifyPhone time, ', (token === phone.get('code2FA') && (Date.now() - Date.parse(phone.get('updatedAt')) < 300000)), phone.get('code2FA'), token, Date.now(), Date.now() - Date.parse(phone.get('updatedAt')))
          if (token === phone.get('code2FA') && (Date.now() - Date.parse(phone.get('updatedAt')) < 300000)) {
            phone.destroy({ useMasterKey: true })
            return true
          }
          if (Date.now() - Date.parse(phone.get('updatedAt')) < 300000) {
            throw new Error('Code Wrong')
          }
        }
        throw new Error('Code Wrong or Expired')
      })
  }
}
module.exports = PhoneVerification
