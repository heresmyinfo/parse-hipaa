/* global Parse */

var general = require('./general.js')

async function buildQRCodeSchema (user) {
  const QRCodeQuery = new Parse.Query('QRCode')
  const code = await QRCodeQuery.first({ useMasterKey: true })
  if (!code) {
    const newCode = new QRCode()
    newCode.set('QRCode', null)
    newCode.set('user', null)
    newCode.set('circle', null)
    newCode.set('metal', false)
    await newCode.save(null, { useMasterKey: true })
    await newCode.destroy({ useMasterKey: true })
  }
}

class QRCode extends Parse.Object {
  constructor () {
    super('QRCode')
  }

  static async createDefault (user, defaultCircle) {
    const newCode = new QRCode()
    newCode.setACL(new Parse.ACL(user))
    newCode.set('QRCode', null)
    newCode.set('user', user)
    newCode.set('circle', defaultCircle)
    newCode.set('metal', false)
    newCode.set('name', 'Default')
    await newCode.save(null, { useMasterKey: true })
    return newCode
  }

  /**
   * Create metal QR code not attached to any user
   * @param {string} label - any string label (eg. Vegas Roadshow 2019)
   */
  static async createMetal (label) {
    const newCode = new QRCode()
    newCode.setACL(new Parse.ACL())
    newCode.set('QRCode', null)
    newCode.set('user', null)
    newCode.set('circle', null)
    newCode.set('metal', true)
    newCode.set('name', 'Default')
    newCode.set('label', label)
    await newCode.save(null, { useMasterKey: true })
    return newCode
  }
}

/**
 * @function beforeSave
 * @description set a unique value for QR code if there is none
 * @todo
 */
Parse.Cloud.beforeSave('QRCode', async (request, response) => {
  console.log('before Save QRCode... create QR code start')
  if (!request.object.get('QRCode')) {
    console.log(
      'before Save QRCode... create QR code ',
      request.object,
      request.object.get('QRCode')
    )
    const maxAttempts = 20
    // Generating new random QR Code with several attempts
    for (let i = 0; i < maxAttempts; i++) {
      const newQRCode = await general.getNewQRCode()
      const qrcodeQuery = new Parse.Query('QRCode')
      qrcodeQuery.equalTo('QRCode', newQRCode)
      const found = await qrcodeQuery.first({ useMasterKey: true })
      console.log('before Save QRCode searching ', newQRCode, found)
      if (!found) {
        console.log('before Save QRCode setting', newQRCode)
        request.object.set('QRCode', newQRCode)
        return response.success()
      }
    }
  }
  response.success()
})

exports.pushToUser = function (toUser, data) {}

module.exports = QRCode

/**
 * @function queryQRCode
 * @description [usage MOBILE] query a given QRCode for existence and defines next steps. Possibilities:
 *  - QR code does not exist in the system - this is an invalid request - return null {answer: null, list: QRCode list }
 *  - QR code exist in the system and is from the requester - user is asking for context in QR code list - {answer: 'owned', list: QRCode list }
 *  - QR code exist in the system and is free  - user wants to attach a QR code to his user and asks for context  - returns {answer: 'attach', list: new QRCode list }
 *  - QR code exist in the system and is from other user and connection exists (might be pending!) - returns {answer: 'connected', list: QRCodeList, connection }
 *  - QR code exist in the system and is from other user - an invite context to build it and public flag (is circle public?) - returns {answer: 'invite', list: QRCodeList, public: Boolean }
 * @returns {answer: 'attach' || 'invite' || 'owned', list: QRCodelist }
 * @kind Cloud Function
 */
Parse.Cloud.define('queryQRCode', async function (request, response) {
  console.log('queryQRCode START ', request.params, request.user)
  if (!request.user) {
    return response.error('Must be signed up and logged in to queryQRCode.')
  }
  const qrCodeQuery = new Parse.Query('QRCode')
  qrCodeQuery.include('user')
  qrCodeQuery.include('circle')
  qrCodeQuery.equalTo('QRCode', request.params.QRCode)
  const QRCode = await qrCodeQuery.first({ useMasterKey: true })
  const myQRCodesQuery = new Parse.Query('QRCode')
  myQRCodesQuery.include('circle')
  myQRCodesQuery.equalTo('user', request.user)
  const myQRCodeList = await myQRCodesQuery.find(request.user.sessionOptions())
  console.log('queryQRCode QRCode ', QRCode)

  if (!QRCode) {
    // Does not Exist in the system
    console.log('queryQRCode Does not Exist in the system', QRCode)
    return response.success({ answer: null, list: myQRCodeList })
  }

  console.log('queryQRCode QRCode Exists in the system')

  // Does not belong to anyone
  if (!QRCode.get('user')) {
    console.log('queryQRCode do not belong to any', QRCode.get('user'))
    return response.success({ answer: 'attach', list: myQRCodeList })
  }

  // Belongs to me
  if (QRCode.get('user').id === request.user.id) {
    return response.success({ answer: 'owned', list: myQRCodeList })
  }
  // Belong to other
  console.log('queryQRCode belong to other', QRCode.get('user'))

  // Check if connected (incoming connection)
  const incomingConnectionQuery = new Parse.Query('Connection')
  incomingConnectionQuery.equalTo('toPerson', request.user)
  incomingConnectionQuery.equalTo('fromPerson', QRCode.get('user'))
  incomingConnectionQuery.notEqualTo('status', 'declined')
  const incomingConnection = await incomingConnectionQuery.first({ useMasterKey: true })
  if (incomingConnection) {
    console.log('queryQRCode already connected', incomingConnection)
    return response.success({ answer: 'connected', list: myQRCodeList, connection: incomingConnection })
  }

  // Check if connected (outgoing connection)
  const outgoingConnectionQuery = new Parse.Query('Connection')
  outgoingConnectionQuery.equalTo('fromPerson', request.user)
  outgoingConnectionQuery.equalTo('toPerson', QRCode.get('user'))
  // We query pending because we've excluded 'connected' at previous check (if connected must find incoming)
  // And for now let's allow re-request if connection was declined
  outgoingConnectionQuery.equalTo('status', 'pending')
  const outgoingConnection = await outgoingConnectionQuery.first({ useMasterKey: true })
  if (outgoingConnection) {
    console.log('queryQRCode already connected', outgoingConnection)
    return response.success({ answer: 'connected', list: myQRCodeList, connection: outgoingConnection })
  }
  return response.success({
    answer: 'invite',
    list: myQRCodeList,
    public: Boolean(QRCode.get('circle') && QRCode.get('circle').get('public'))
  })
})

/**
 * @function getQRCodes
 * @description [usage MOBILE] query QRCodes for a user
 * @kind Cloud Function
 */
Parse.Cloud.define('getQRCodes', async function (request, response) {
  console.log('getQRCodes START ', request.params, request.user)
  if (!request.user) {
    return response.error('Must be signed up and logged in to getQRCodes.')
  }
  const queryList = new Parse.Query('QRCode')
  queryList.include('circle')
  queryList.equalTo('user', request.user)
  const QRCodeList = await queryList.find(request.user.sessionOptions())
  return response.success(QRCodeList)
})

/**
 * @function createQRCode
 * @description [usage MOBILE] create  a new QRCode for a user
 * @kind Cloud Function
 */
Parse.Cloud.define('createQRCode', async function (request, response) {
  console.log('createQRCode START ', request.params, request.user)
  if (!request.user) {
    return response.error('Must be signed up and logged in to createQRCode.')
  }
  const user = request.user
  await user.get('profile').fetch({ useMasterKey: true })

  const newCode = new QRCode()
  newCode.setACL(new Parse.ACL(user))
  newCode.set('QRCode', null)
  newCode.set('name', request.params.name)
  newCode.set('user', user)
  newCode.set('circle', user.get('profile').get('defaultCircle'))
  newCode.set('metal', false)
  await newCode.save(null, { useMasterKey: true })

  const queryList = new Parse.Query('QRCode')
  queryList.include('circle')
  queryList.equalTo('user', user)
  const QRCodeList = await queryList.find(user.sessionOptions())

  return response.success({ QRCodes: QRCodeList, newCode })
})

/**
 * @function detachQRCode
 * @description [usage MOBILE] detach QRCode from a user
 * @kind Cloud Function
 * @param {string} QRCodeValue
 */
Parse.Cloud.define('detachQRCode', async function (request, response) {
  console.log('detachQRCode START ', request.params, request.user)
  if (!request.user) {
    return response.error('Must be signed up and logged in to detachQRCode.')
  }
  const query = new Parse.Query('QRCode')
  query.equalTo('user', request.user)
  query.equalTo('QRCode', request.params.QRCode)
  const QRCode = await query.first({ useMasterKey: true })
  if (QRCode) {
    await QRCode.set('user', null)
    await QRCode.set('circle', null)
    let roleACL = new Parse.ACL()
    roleACL.setPublicReadAccess(true)
    QRCode.setACL(roleACL)
    await QRCode.save(null, { useMasterKey: true })
  }
  const queryList = new Parse.Query('QRCode')
  queryList.include('circle')
  queryList.equalTo('user', request.user)
  const QRCodeList = await queryList.find(request.user.sessionOptions())
  return response.success(QRCodeList)
})

/**
 * @function setQRCircle
 * @description [usage MOBILE] sets the circleId to a QRCode of a specific user, also allows changing name
 * @kind Cloud Function
 * @todo
 */
Parse.Cloud.define('setQRCircle', async function (request, response) {
  const user = request.user
  const circleQuery = new Parse.Query('Circle')
  const query = new Parse.Query('QRCode')
  const qrCircle = await circleQuery.get(request.params.circleId, user.sessionOptions())
  query.equalTo('user', user)
  query.equalTo('QRCode', request.params.QRCode)
  const QRCode = await query.first({ useMasterKey: true })
  console.log('setting QRcircleId of QRCode: ', qrCircle, QRCode)
  await QRCode.set('circle', qrCircle)
  if (request.params.name) {
    QRCode.set('name', request.params.name)
  }
  await QRCode.save(null, { useMasterKey: true })
  const queryList = new Parse.Query('QRCode')
  queryList.include('circle')
  queryList.equalTo('user', request.user)
  const QRCodeList = await queryList.find(user.sessionOptions())
  return response.success(QRCodeList)
})

/**
 * @function attachQRCode
 * @description [usage MOBILE] attach a QRCode to a user
 * @kind Cloud Function
 * @param {string} QRCode - the code we want to attach
 */
Parse.Cloud.define('attachQRCode', async function (request, response) {
  console.log('attachQRCode START ', request.params, request.user)
  if (!request.user) {
    return response.error('Must be signed up and logged in to attachQRCode.')
  }
  const user = request.user
  await user.get('profile').fetch({ useMasterKey: true })
  const query = new Parse.Query('QRCode')
  query.equalTo('user', null)
  query.equalTo('QRCode', request.params.QRCode)
  const QRCode = await query.first({ useMasterKey: true })
  if (QRCode) {
    QRCode.set('user', user)
    QRCode.set('circle', user.get('profile').get('defaultCircle'))
    QRCode.setACL(new Parse.ACL(user))
    await QRCode.save(null, { useMasterKey: true })
  }

  const queryList = new Parse.Query('QRCode')
  queryList.include('circle')
  queryList.equalTo('user', user)
  const QRCodeList = await queryList.find(request.user.sessionOptions())
  return response.success(QRCodeList)
})

/**
 * @function editQRDescription
 * @description [usage Web] edit qr code description
 * @kind Cloud Function
 * @param {string} id - QR Code object id
 * @param {string} name - new name
 */
Parse.Cloud.define('editQRName', async function (request, response) {
  if (!request.user) {
    return response.error('Must be signed up and logged in to editQRName.')
  }
  const { id, name } = request.params
  if (!name) {
    return response.error('New QR Code name must be not empty')
  }
  const user = request.user
  const query = new Parse.Query('QRCode')
  query.equalTo('user', user)
  const QRCode = await query.get(id, user.sessionOptions())
  await QRCode.save('name', name, { useMasterKey: true })
  return response.success(QRCode)
})
