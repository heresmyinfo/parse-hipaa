/* global Parse */

var _ = require('underscore')
var general = require('./general.js')
const bcrypt = require('bcrypt')
const { pushAtIndex } = require('./modules/data')

const TYPE_MOBILE = 'mobile'
const TYPE_LANDLINE = 'landline'

const makePhoneType = (type) => ({
  name: 'type',
  types: [TYPE_MOBILE, TYPE_LANDLINE],
  value: type || TYPE_MOBILE,
  showName: 'Type'
})

const verifyEmail = async (user, login) => {
  console.log('VERIFYEMAIL ')
  const property = user.get('profile').get('properties').find(p =>
    p.get('name') === 'emailAddresses' &&
    p.get('parameters') === [1].value === login.email &&
    p.get('verified') !== true
  )
  console.log('VERIFYEMAIL property: ', property)
  if (property) {
    await property.save('verified', true, { useMasterKey: true })
  }
}

class Property extends Parse.Object {
  constructor () {
    super('Property')
  }

  // instance
  isType (propertyType) {
    var parameters = this.get('parameters')
    var typeParam = parameters.type

    if (typeParam) {
      if (Array.isArray(typeParam)) {
        for (var i = 0; i < typeParam.length; i++) {
          if (typeParam[i].toLowerCase() === propertyType.toLowerCase()) {
            return true
          }
        }
      } else if (typeParam.toLowerCase() === propertyType.toLowerCase()) {
        return true
      }
    }
    return false
  }

  getTitle () {
    switch (this.get('name')) {
      case 'emailAddresses':
        return 'email address'
      case 'phoneNumbers':
        return 'phone number'
      default:
        return this.get('name')
    }
  }

  /**
 * @method isHMISocialProfile
 * @todo It is not used, along with all the concept. This is beeing kept as an URL in the contact/connections: HeresMyInfo URL
 *  we should modify this function to get us that prop
 */
  isHMISocialProfile () {
    if (this.get('name') === 'x-socialprofile') {
      if (this.isType('heresmyinfo')) { return true }
    }
    return false
  }

  isNamePart () {
    var propertyName = this.get('name')
    if (propertyName === 'givenName' || propertyName === 'familyName' ||
            propertyName === 'middleName' || propertyName === 'prefix' ||
            propertyName === 'suffix') { return true }
    return false
  }

  /**
   * Check if current property has parameter at given index with given value
   * @param {int|string} index
   * @param {any} value
   */
  hasParameterValueByIndex (index, value) {
    const parameters = this.get('parameters')
    return parameters && parameters[index] && parameters[index].value === value
  }

  /**
   * @method reviewConnectionsAfterPropertyModified
   * @description [usage MOBILE] review if there is any pending connections based on
   *  after an email or a phone is modified/added and then (only when verified)
   * @param {object} params
   */
  reviewConnectionsAfterPropertyModified () {
    if (this.get('verified')) {
      const queryUser = new Parse.Query(Parse.User)
      const ACLUserId = Object.keys(this.get('ACL').permissionsById)[0]
      console.error('[reviewConnectionsAfterPropertyModified] START', ACLUserId)
      queryUser.equalTo('objectId', ACLUserId)
      queryUser.first({ useMasterKey: true }
      ).then((user) => {
        let acl = new Parse.ACL(user)
        // for now, just email - then we should use thisName
        const params = this.get('parameters')
        console.error('[reviewConnectionsAfterPropertyModified] 2', params, params[1], params[1].value)
        const name = this.get('name') === 'emailAddresses' ? 'email' : 'phone'
        const value = (params && params[1]) ? params[1].value : null
        console.error('[reviewConnectionsAfterPropertyModified] items verified', name, value)
        const queryConn = new Parse.Query('Connection')
        queryConn.equalTo(name, value)
        queryConn.find({ useMasterKey: true }
        ).then((connections) => {
          console.error('[reviewConnectionsAfterPropertyModified] 3', connections)
          connections.map((connection) => {
            acl.setReadAccess(connection.get('fromPerson'), true)
            acl.setWriteAccess(connection.get('fromPerson'), true)
            connection.setACL(acl)
            connection.set('toPerson', user)
            const thisUser = user
            user.getFullName()
              .then((name) => {
                console.error('[reviewConnectionsAfterPropertyModified] 4', name)
                connection.save(null, { useMasterKey: true }).then(() => {
                  const msgQuery = connection.relation('messages').query()
                  msgQuery.find({ useMasterKey: true })
                    .then(function (messages) {
                      messages.forEach((msg) => {
                        msg.set('toPerson', user)
                        msg.set('toName', name)
                        msg.save(null, { useMasterKey: true })
                      })
                    })
                    .catch((e) => {
                      console.log('conn save not ok: ', e)
                    })
                })
                acl = new Parse.ACL(ACLUserId)
              })
              .then(() => {
                console.log('[reviewConnectionsAfterPropertyModified] activateFlagForUser ', thisUser)
                thisUser.set('newConnectionsFlag', true)
                thisUser.save(null, { useMasterKey: true })
              })
              .catch((e) => {
                console.log('user save not ok: ', e)
              })
          })
        }).catch((err) => {
          console.error('error working with conns:', err)
        })
      }
      ).catch((err) => {
        console.error('error working with user:', err)
      })
    }
  }

  /**
   * @method reviewPrimaryPropertyAfterUpdate
   * @description [usage WEB] review if the primary property value was changed and updated related User fields
   * @param {Property} oldProperty - property before update
   */
  async reviewPrimaryPropertyAfterUpdate (oldProperty) {
    const property = this
    // For phone number check if it was switched mobile -> landline then we need new primary mobile number
    let changedPhoneTypeToLandline = false
    if (property.get('name') === 'phoneNumbers') {
      if (property.get('parameters')[3].value === TYPE_LANDLINE &&
            (!oldProperty.get('parameters')[3] ||
              oldProperty.get('parameters')[3].name !== 'type' ||
              oldProperty.get('parameters')[3].value !== TYPE_LANDLINE
            )
      ) {
        changedPhoneTypeToLandline = true
      }
    }
    let newValue = property.get('parameters')[1].value
    const oldValue = oldProperty.get('parameters')[1].value
    if (newValue !== oldValue || changedPhoneTypeToLandline) {
      // Value was changed, check if oldProperty was primary
      // Check if there is an existing user with primary property equal to provided
      const userQuery = new Parse.Query(Parse.User)
      userQuery.include('profile')
      userQuery.include('profile.properties')
      if (property.get('name') === 'emailAddresses') {
        userQuery.equalTo('email', oldValue)
      } else if (property.get('name') === 'phoneNumbers') {
        userQuery.equalTo('phone', oldValue)
      }
      // Double check that property belongs to the user
      const profileQuery = new Parse.Query('Profile')
      profileQuery.equalTo('properties', property)
      userQuery.matchesQuery('profile', profileQuery)
      const user = await userQuery.first({ useMasterKey: true })
      if (user) {
        if (property.get('name') === 'emailAddresses') {
          user.set({ email: newValue, username: newValue })
        } else if (property.get('name') === 'phoneNumbers') {
          // If primary phone number switched to landline, need to set another mobile number as primary
          if (changedPhoneTypeToLandline) {
            const anotherProperty = user.get('profile').get('properties').find(_ =>
              _.get('name') === property.get('name') &&
              _.id !== property.id &&
              _.get('verified') &&
              !_.hasParameterValueByIndex(3, TYPE_LANDLINE)
            )
            newValue = anotherProperty.get('parameters')[1].value
          }
          user.set({ phone: newValue, E164: newValue })
        }
        await user.save(null, { useMasterKey: true })
      }
    }
  }

  /**
   * @method newPrefixProperty
   * @description prefix psuedo property, honorific prefixes
   */
  static newPrefixProperty (user, prefix) {
    var property = new Property()
    property.setACL(new Parse.ACL(user))

    property.set('highlander', true)
    property.set('exports', false)
    property.set('name', 'prefix')
    property.set('parameters', {})
    property.set('type', 'text')
    property.set('value', prefix)

    return property.save(null, { useMasterKey: true })
  }

  /**
   * @method newGivenNameProperty
   * @description givenName psuedo property
   */
  static newGivenNameProperty (user, givenName) {
    var property = new Property()
    property.setACL(new Parse.ACL(user))
    property.set('highlander', true)
    property.set('exports', false)
    property.set('name', 'givenName')
    property.set('parameters', {})
    property.set('type', 'text')
    property.set('value', givenName)

    return property.save(null, { useMasterKey: true })
  }

  /**
   * @method newMiddleNameProperty
   * @description middleName psuedo property
   */
  static newMiddleNameProperty (user, middleName) {
    var property = new Property()
    property.setACL(new Parse.ACL(user))
    property.set('highlander', true)
    property.set('exports', false)
    property.set('name', 'middleName')
    property.set('parameters', {})
    property.set('type', 'text')
    property.set('value', middleName)

    return property.save(null, { useMasterKey: true })
  }

  /**
   * @method newFamilyNameProperty
   * @description familyName psuedo property
   */
  static newFamilyNameProperty (user, familyName) {
    var property = new Property()
    property.setACL(new Parse.ACL(user))
    property.set('highlander', true)
    property.set('exports', false)
    property.set('name', 'familyName')
    property.set('parameters', {})
    property.set('type', 'text')
    property.set('value', familyName)

    return property.save(null, { useMasterKey: true })
  }

  /**
   * @method newSuffixProperty
   * @description suffix psuedo property, honorific suffixes
   */
  static newSuffixProperty (user, suffix) {
    var property = new Property()
    property.setACL(new Parse.ACL(user))
    property.set('highlander', true)
    property.set('exports', false)
    property.set('name', 'suffix')
    property.set('parameters', {})
    property.set('type', 'text')
    property.set('value', suffix)

    return property.save(null, { useMasterKey: true })
  }

  /**
   * @method newFullNameProperty
   * @description create a full name (fn) property
   */
  static newFullNameProperty (user, fn) {
    var property = new Property()
    property.setACL(new Parse.ACL(user))
    property.set('highlander', true)
    property.set('name', 'fn')
    property.set('parameters', {})
    property.set('type', 'text')
    property.set('value', fn)
    property.set('exports', true)

    return property.save(null, { useMasterKey: true })
  }

  /**
   * @method newEmailProperty
   * @description create an email property
   */
  static newEmailProperty (user, email) {
    console.log('new emwail property', JSON.stringify(user), email)

    var property = new Property()
    property.setACL(new Parse.ACL(user))
    property.set('name', 'emailAddresses')
    property.set('type', 'text')
    property.set('exports', true)
    property.set('value', null)
    var emailParameter = {
      0: {
        name: 'label',
        types: [
          'personal',
          'work',
          'personal & work'
        ],
        value: 'personal & work',
        showName: 'Label'
      },
      1: {
        name: 'email',
        types: [],
        value: email,
        showName: 'E-mail'
      }
    }
    property.set('parameters', emailParameter)

    console.log('email param', JSON.stringify(emailParameter))

    return property.save(null, { useMasterKey: true })
  }

  /**
   * @method newPhoneProperty
   * @description create a phone property, keep data as user entered it
   * @param {Parse.User} user
   * @param {string} phone
   * @param {string} label home, work, etc
   * @param {string} countryCode US, PT, etc
   * @param {string} type mobile, landline
   */
  static newPhoneProperty (user, phone, label, countryCode, type) {
    console.log('newPhoneProperty creating phone - CHECK COUNTRY CODE ', user, phone)
    var property = new Property()
    property.setACL(new Parse.ACL(user))
    property.set('name', 'phoneNumbers')
    property.set('type', 'text')
    var phoneType = {
      0: {
        name: 'label',
        types: [
          'personal',
          'work',
          'personal & work',
          'cell',
          'fixed'
        ],
        value: label || 'personal',
        showName: 'Label'
      },
      1: {
        name: 'number',
        types: [],
        value: phone,
        showName: 'Number'
      },
      2: {
        name: 'countryCode',
        types: [],
        value: countryCode,
        showName: null
      },
      3: makePhoneType(type)
    }
    property.set('parameters', phoneType)

    property.set('value', null)
    property.set('exports', true)

    return property.save(null, { useMasterKey: true })
  }

  /**
   * @method newHeresMyInfoSocialProperty
   * @description HeresMyInfo social property
   * @todo - need to change this
   */
  static newHeresMyInfoSocialProperty (user) {
    var property = new Property()
    property.setACL(new Parse.ACL(user))
    var username = user.get('username')

    property.set('name', 'x-socialprofile')

    var propParams = {
      type: 'heresmyinfo',
      'x-userid': user.id,
      'x-user': username
    }

    property.set('parameters', propParams)
    property.set('type', 'unknown')
    property.set('value', 'https://heresmyinfo.com/person/' + username)
    property.set('exports', true)

    return property.save(null, { useMasterKey: true })
  }

  /**
   * @method privacyReviewedFlag
   * @description set flag after reviewed Privacy Modal
   */
  static privacyReviewedFlag (user) {
    var property = new Property()
    property.setACL(new Parse.ACL(user))
    property.set('reviewedPrivacy', true)
    property.set('highlander', true)
    property.set('exports', false)
    property.set('type', 'text')

    return property.save(null, { useMasterKey: true })
  }

  /**
   * @method buildInitialProperties
   * @description build an initial set of properties
   */
  static async buildInitialProperties (user, givenName, familyName, delimiter, email, phone, countryCode, workEmail, workPhone) {
    const properties = []
    const fullNameString = `${givenName} ${familyName}`

    console.log('buildInitialProperties', email)
    try {
      if (!skipProperty(properties, fullNameString)) {
        const property = await Property.newFullNameProperty(user, fullNameString)
        properties.push(property)
      }

      if (!skipProperty(properties, givenName)) {
        const property = await Property.newGivenNameProperty(user, givenName)
        properties.push(property)
      }

      if (!skipProperty(properties, familyName)) {
        const property = await Property.newFamilyNameProperty(user, familyName)
        properties.push(property)
      }

      if (email && !skipProperty(properties, email)) {
        const property = await Property.newEmailProperty(user, email, 'home')
        properties.push(property)
      }

      if (workEmail && !skipProperty(properties, workEmail)) {
        const property = await Property.newEmailProperty(user, workEmail, 'personal & work')
        properties.push(property)
      }

      if (phone && !skipProperty(properties, phone)) {
        const property = await Property.newPhoneProperty(user, phone, 'personal & work', countryCode)
        properties.push(property)
      }
    } catch (error) {
      // Cleanup
      const promises = []
      properties.forEach(property => promises.push(property.destroy({ useMasterKey: true })))
      await Promise.all(promises)
      throw error
    }

    return properties
  }

  /**
   * @method getNameParts
   * @description get a Promise resolved with a list of this circle's name-part properties
   * @todo not sure its usage
   */
  static getNameParts (user, arrProperties) {
    var promise = new Parse.Promise()
    var arrNameParts = []

    var token = user.getSessionToken()
    Property.fetchAllIfNeeded(arrProperties, { sessionToken: token }).then(
      function (properties) {
        _.each(properties, function (property) {
          if (property.isNamePart()) { arrNameParts.push(property) }
        })
        promise.resolve(arrNameParts)
      },
      function (error) {
        promise.reject(error)
      }
    )
    return promise
  }

  // build the default name from an array of name parts
  static buildFullNameString (nameParts) {
    var fullNameString = ''
    var prefix = ''
    var givenname = ''
    var middlename = ''
    var familyname = ''
    var suffix = ''

    var fullName = {}

    _.each(nameParts, function (property) {
      fullName[property.attributes.name] = property.attributes.value
    })

    if (fullName.prefix) prefix = fullName.prefix + ' '
    if (fullName.givenname) givenname = fullName.givenname + ' '
    if (fullName.middlename) middlename = fullName.middlename + ' '
    if (fullName.familyname) familyname = fullName.familyname + ' '
    if (fullName.suffix) suffix = fullName.suffix + ' '

    fullNameString = (prefix + givenname + middlename + familyname + suffix).trim()

    return fullNameString
  }

  /**
   * @method getPropertyByParameterValue
   * @description [usage MOBILE] get a parameter property (email or phone) by quering it's value string
   * @description [usage PARSE] used to check properties by value existance or unique
   * @param {string} params.value - value to search
   * @param {string} params.name - property name
   * @param {string} params.verified - verified status of the field - optional: true looks for verified field == true properties
   * @param {string} params.user - properties user context
   */
  static async getPropertyByParameterValue (value, name, verified, user) {
    console.log('getPropertyByParameterValue value: ', value, 'name: ', name, 'verified: ', verified)
    const query = new Parse.Query('Property')
    query.equalTo('name', name)
    // Check for user with this email address
    query.equalTo('parameters.1.value', value.replace('\'', '\'\''))
    // Check if this email is verified
    // Will return OID only if verified
    if (verified) {
      query.equalTo('verified', true)
    }
    const properties = await query.find({ useMasterKey: true })
    // user exists if property exists
    for (const property of properties) {
      // If no user is found, return nothing
      if (!user) {
        console.log('NO USER PROPERTY: ', property)
        return property
      }
      // if user exists, return OID fo email property
      const ACLarray = Object.values(property.get('ACL'))
      const ACLUserIds = ACLarray.map(acl => (Object.keys(acl)[0]))
      if (ACLUserIds.indexOf(user.id) !== -1) {
        console.log('USER FOUND PROPERTY: ', property)
        return property
      }
    }
  }
}

Parse.Object.registerSubclass('Property', Property)

/**
 * @function setPropertyVerified
 * @description [usage MOBILE] Set a verifiable property (email and for now) as verified when a invite message is received
 *  at the end, activate pulling system to send data to user
 * @kind Cloud Function
 * @param {object} params
 * @param {string} params.messageId - invite message id
 * @param {string} params.token - verification token
 * @todo it is missing kind of invite to be fetched - might generate bugs (query.equalTo(kind, 'confirmation?' ))
 */
Parse.Cloud.define('setPropertyVerified', async function (request, response) {
  const messageId = request.params.messageId
  const token = request.params.token
  console.log('setPropertyVerified', messageId, token)

  try {
    const messageQuery = new Parse.Query('Message')
    messageQuery.equalTo('objectId', messageId)
    messageQuery.include('fromPerson')
    const invite = await messageQuery.first({ useMasterKey: true })
    if (!invite) {
      return response.error('Verification id is not found')
    }

    const tokenValid = await bcrypt.compare(token, invite.get('data'))
    if (!tokenValid) {
      return response.error('Verification token is not valid')
    }

    const user = invite.get('fromPerson')
    const property = await Property.getPropertyByParameterValue(invite.get('email'), 'emailAddresses', false, user)
    if (!property) {
      return response.error('Verification email is not found')
    }
    await property.save('verified', true, { useMasterKey: true })
    await user.save('profileUpdatedFlag', true, { useMasterKey: true })
    return response.success({ email: invite.get('email') })
  } catch (err) {
    console.error('setPropertyVerified error:', err)
    return response.error(err)
  }
})

/**
 * @function addRemoveUpdatePropertyFromProfile
 * @description [usage MOBILE] Add, remove or update a property from profile based on property name
 *  and value (null value will delete the property) it will update only based on id
 * @description [usage WEB] same as mobile
 * @kind Cloud Function
 * @param {object} params
 * @param {string} params.id - property id
 * @param {string} params.name - property name (to be created if it does not exist with id)
 * @param {string} params.value - property value to be set (null values will delete the prop)
 */
Parse.Cloud.define('addRemoveUpdatePropertyFromProfile', async function (request, response) {
  const user = request.user
  const name = request.params.name
  let value = request.params.value || ''
  const id = request.params.id || ''

  console.log('addRemoveUpdatePropertyFromProfile request: ', JSON.stringify(request.params))

  if (value[1] !== undefined) {
    console.log(' XXX value: ', value)
  }

  if (name === 'phoneNumbers' && value[1] !== undefined) {
    value[1].value = general.normalizePhone(value[1].value)
  }

  try {
    const query = new Parse.Query('Profile')
    query.include('properties')
    const profile = await query.first(user.sessionOptions())
    const properties = profile.get('properties')
    let property = properties.find(p => p.id === id)

    // Custom handle thumbnailImage, store value as url to GCS image
    if (name === 'thumbnailImage' && value) {
      const profileImage = new Parse.File('profile.jpg', { base64: value })
      await profileImage.save(user.sessionOptions())
      value = profileImage.url()
    }

    let anotherProperty = null
    if (property && (property.get('name') === 'phoneNumbers' || property.get('name') === 'emailAddresses')) {
      // For phoneNumbers it must be not landline
      anotherProperty = profile.get('properties').find(_ =>
        _.get('name') === property.get('name') &&
        _.id !== property.id &&
        _.get('verified') &&
        !_.hasParameterValueByIndex(3, TYPE_LANDLINE)
      )
    }

    // Delete
    if (!value) {
      if (property) {
        // Check if it is the last property - then don't allow delete
        if (property.get('name') === 'phoneNumbers' || property.get('name') === 'emailAddresses') {
          if (!anotherProperty) {
            if (property.get('name') === 'emailAddresses') {
              return response.error(`Add at least one verified ${property.getTitle()} before deleting`)
            } else {
              return response.error(`Add at least one verified mobile ${property.getTitle()} before deleting`)
            }
          }
        }
        // Delete property
        await property.destroy({ useMasterKey: true })
        return response.success(profile.id)
      }

      return response.error('Property to delete not found')
    }

    // BC Compatibility for old values
    if (name === 'phoneNumbers') {
      if (!value[3]) {
        value[3] = makePhoneType(TYPE_MOBILE)
      }
      if (value[3].name !== 'type') {
        value = pushAtIndex(value, 3, makePhoneType(TYPE_MOBILE))
      }
    }

    // Extra check on uniqueness across user's properties including unverified
    if (name === 'emailAddresses' || name === 'phoneNumbers') {
      // value[1].value is current email
      const duplicateProperty = await Property.getPropertyByParameterValue(value[1].value, name, false, user)
      console.log('duplicateProperty: ', duplicateProperty)
      console.log('property: ', property)
      if (duplicateProperty) {
        if (!property) {
          return response.error(`You already have this ${duplicateProperty.getTitle()}.`)
        }
        if (property && property.id !== duplicateProperty.id) {
          return response.error(`You already have this ${duplicateProperty.getTitle()}.`)
        }
      }
    }

    // Update
    if (property) {
      if (typeof value === 'object') {
        // For phone number we need to perform extra checks when we change the type
        if (property.get('name') === 'phoneNumbers') {
          // BC Compatibility for old values
          let parameters = property.get('parameters')
          if (!parameters[3] || parameters[3].name !== 'type') {
            parameters = pushAtIndex(parameters, 3, makePhoneType(TYPE_MOBILE))
            property.set('parameters', parameters)
          }

          // Changed type of phone number
          if (property.get('parameters')[3].value !== value[3].value) {
            if (value[3].value === TYPE_MOBILE) {
              // If phone was landline and changed to mobile - mark it as not verified as sms verificaiton is required
              property.set('verified', false)
            } else if (value[3].value === TYPE_LANDLINE) {
              // If phone was mobile and changed to landline - check if there is one more verified mobile phone
              if (!anotherProperty) {
                return response.error(`Add at least one verified mobile ${property.getTitle()} before swithcing to landline`)
              }
            } else {
              return response.error(`Unsupported phone type ${value[3].value}`)
            }
          }
        }
        property.set('value', '')
        property.set('parameters', value)
      } else {
        property.set('value', value)
        property.set('parameters', {})
      }
      await property.save(null, { useMasterKey: true })
    } else {
      // Create
      console.log('is fromSocialAccount? ', request.params.fromSocialAccount)

      property = new Property()
      property.setACL(new Parse.ACL(user))
      property.set('exports', true)
      property.set('type', 'text')
      property.set('name', name)
      if (request.params.fromSocialAccount === true) {
        console.log('fromSocialAccount TRUE')
        property.set('isFromSocial', true)
      } else {
        console.log('fromSocialAccount FALSE')
      }

      if (typeof value === 'object') {
        property.set('value', '')
        property.set('parameters', value)
      } else {
        property.set('value', value)
        property.set('parameters', {})
      }
      property = await property.save(null, { useMasterKey: true })
      profile.addUnique('properties', property)
      await profile.save(null, { useMasterKey: true })
    }

    response.success(profile.id)
  } catch (error) {
    response.error(error)
  }
})

/**
 * @todo Not sure why it is needed... needs code review
 **/
function skipProperty (properties, newProp) {
  for (var c = 0; c < properties.length; c++) {
    // if we already have the value in a property, then skip.
    if (properties[c].get('value') && properties[c].get('value') === newProp) {
      return true
    }
  }
  return false
}

/**
 * @kind cloud
 * @description this ensures there are no duplicate verified fields
 **/
Parse.Cloud.beforeSave(Property, async function (request, response) {
  const { object: property, original: oldProperty } = request

  console.log('Property beforeSave request', request)
  // If the value was changed - mark property not verified
  if (property.get('verified') && oldProperty && oldProperty.get('parameters')) {
    if (property.get('parameters')[1].value !== oldProperty.get('parameters')[1].value) {
      property.set('verified', false)
    }
  }

  // 1. Ensure the phoneNumber type exists or add default
  // 2. Make landline verified right away
  if (property.get('name') === 'phoneNumbers') {
    const parameters = property.get('parameters')
    if (!parameters[3]) {
      parameters[3] = makePhoneType(TYPE_MOBILE)
      property.set('parameters', parameters)
    } else if (parameters[3].value === TYPE_LANDLINE && property.get('verified') !== true) {
      // Landline is always verified
      property.set('verified', true)
    }
  }

  // Validate value exists
  if (property.get('name') === 'phoneNumbers' || property.get('name') === 'emailAddresses') {
    if (!property.get('parameters') || !property.get('parameters')[1] || !property.get('parameters')[1].value) {
      return response.error(`Property ${property.get('name')} doesn't include required parameters`)
    }
  }

  // Normalize phone number
  if (property.get('name') === 'phoneNumbers') {
    // const preNormalizedPhone = property.get('parameters')[1].value

    const normalizedPhone = general.normalizePhone(property.get('parameters')[1].value)
    console.log('normalizedPhone: ', normalizedPhone)
    if (normalizedPhone !== property.get('parameters')[1].value) {
      const parameters = property.get('parameters')
      parameters[1].value = normalizedPhone
      property.set('parameters', parameters)
    }
  }

  // Check uniqueness for email and phone number
  if (property.get('name') === 'emailAddresses' || property.get('name') === 'phoneNumbers') {
    const params = property.get('parameters')
    const existingProperty = await Property.getPropertyByParameterValue(params[1].value, property.get('name'), true)
    if (property && existingProperty && existingProperty.id !== property.id) {
      return response.error(`This ${property.getTitle()} is associated with another user. If it is your ${property.getTitle()}, please write us to support@heresmyinfo.com.`)
    }
    // Check if there is an existing user with primary property equal to provided
    const userQuery = new Parse.Query(Parse.User)
    userQuery.include('profile')
    if (property.get('name') === 'emailAddresses') {
      userQuery.equalTo('email', params[1].value)
    } else if (property.get('name') === 'phoneNumbers') {
      userQuery.equalTo('phone', params[1].value)
    }
    if (property.id) {
      // If we have an id (update) when we need to exclude the owner of this property from the search
      const profileQuery = new Parse.Query('Profile')
      profileQuery.equalTo('properties', property)
      userQuery.doesNotMatchQuery('profile', profileQuery)
    }
    const user = await userQuery.first({ useMasterKey: true })
    // If we found the user - either someone has this primary property or we are during signup process (and user has empty properties field)
    if (user) {
      // How can we detect this user is singing up now? He won't have profile properties
      if (user.get('profile') && user.get('profile').get('properties') && user.get('profile').get('properties').length) {
        if (property.get('name') === 'emailAddresses') {
          return response.error('This email is associated with another user. If it is your email, please write us to support@heresmyinfo.com.')
        } else {
          return response.error('This phone number is associated with another user. If it is your phone number, please write us to support@heresmyinfo.com.')
        }
      }
    }
    return response.success()
  }
  response.success()
})

/**
 * @kind cloud
 * @description
 * 1. this calls reviewConnectionsAfterPropertyModified to associate "lost connections" to the new user
 * 2. Also ensures new properties are not verified at creation
 * 3. On primary properties edit update related User fields
 **/
Parse.Cloud.afterSave(Property, async function (request) {
  const { object: property, original: oldProperty } = request
  console.log('[after save Property] 1', property.get('verified'))
  // It is newly created - mark as not verified unless it is a landline phone
  if (property && !property.existed()) {
    let verified = false
    if (property.get('name') === 'phoneNumbers') {
      const type = property.get('parameters')[3]
      if (type && type.value === TYPE_LANDLINE) {
        verified = true
      }
    }
    // if statement to change verified to true if it is a socialAccount
    if (property.get('isFromSocial') === true) {
      verified = true
    }
    property.set('verified', verified)
    property.save(null, { useMasterKey: true })
  }
  console.log('[after save Property] 2', property.get('verified'), property.get('name'))
  if (property && (property.get('name') === 'emailAddresses' || property.get('name') === 'phoneNumbers')) { // && !request.original.get("verified") && property.get('verified') == true
    property.reviewConnectionsAfterPropertyModified()
  }

  // Check if primary property was edited
  if (property && (property.get('name') === 'emailAddresses' || property.get('name') === 'phoneNumbers')) {
    // If we are in the edit mode
    if (oldProperty && oldProperty.id && oldProperty.get('parameters') && oldProperty.get('parameters')[1]) {
      await property.reviewPrimaryPropertyAfterUpdate(oldProperty)
    }
  }

  // Clean thumbnail from GCS
  if (property.get('name') === 'thumbnailImage' && oldProperty && oldProperty.get('value') && oldProperty.get('value') !== property.get('value')) {
    // @todo should we clean old thumbnails at all?
    // They would hold some space but user might have stored version of link to old profile and it will cause 404
  }
})

/**
 * @kind cloud
 * @description
 * Update User model if primary property was deleted
 **/
Parse.Cloud.beforeDelete(Property, async function (request, response) {
  const { object: property } = request
  if (property.get('name') === 'emailAddresses' || property.get('name') === 'phoneNumbers') {
    let anotherProperty = null

    const profileQuery = new Parse.Query('Profile')
    profileQuery.equalTo('properties', property)
    profileQuery.include('properties')
    const profile = await profileQuery.first({ useMasterKey: true })
    if (profile) {
      // For phone number check that it is not landline
      anotherProperty = profile.get('properties').find(_ =>
        _.get('name') === property.get('name') &&
        _.id !== property.id &&
        _.get('verified') &&
        !_.hasParameterValueByIndex(3, TYPE_LANDLINE)
      )
    }
    if (anotherProperty && property.get('parameters') && property.get('parameters')[1]) {
      // Check if it was primary property - then update primary values in User model
      const oldValue = property.get('parameters')[1].value
      const newValue = anotherProperty.get('parameters')[1].value
      const userQuery = new Parse.Query(Parse.User)
      userQuery.include('profile')
      if (property.get('name') === 'emailAddresses') {
        userQuery.equalTo('email', oldValue)
      } else if (property.get('name') === 'phoneNumbers') {
        userQuery.equalTo('phone', oldValue)
      }
      const profileQuery2 = new Parse.Query('Profile')
      profileQuery2.equalTo('properties', property)
      userQuery.matchesQuery('profile', profileQuery2)
      const user = await userQuery.first({ useMasterKey: true })
      if (user) {
        if (property.get('name') === 'emailAddresses') {
          user.set({ email: newValue, username: newValue })
        } else if (property.get('name') === 'phoneNumbers') {
          user.set({ phone: newValue, E164: newValue })
        }
        await user.save(null, { useMasterKey: true })
      }
    }
  }

  response.success()
})

/**
 * @kind cloud
 * @description
 * Remove property from profile properties and circles
 **/
Parse.Cloud.afterDelete(Property, async function (request, response) {
  const { object: property } = request

  const profileQuery = new Parse.Query('Profile')
  profileQuery.equalTo('properties', property)
  profileQuery.include('properties')
  profileQuery.include('circles')
  profileQuery.include('circles.properties')
  const profile = await profileQuery.first({ useMasterKey: true })
  const promises = []
  if (profile) {
    profile.remove('properties', property)
    promises.push(profile.save(null, { useMasterKey: true }))
    profile.get('circles').forEach(circle => {
      circle.remove('properties', property)
      promises.push(circle.save(null, { useMasterKey: true }))
    })

    await Promise.all(promises)
  }

  response.success()
})

module.exports = Property
module.exports.TYPE_MOBILE = TYPE_MOBILE
module.exports.TYPE_LANDLINE = TYPE_LANDLINE
