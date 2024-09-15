/**
 * @class BusinessProperty
 * @description Business properties
 */
const { validateEmail, validateDomain, validateName, validatePhone } = require('./modules/validation')
const Message = require('./message')
const PhoneVerification = require('./phoneVerification.js')
const nanoid = require('nanoid/async')
const dns = require('dns')
const util = require('util')
const { pushAtIndex } = require('./modules/data')

// Business Property types
const PROPERTY_NAME = 'company'
const PROPERTY_DOMAIN = 'urlAddresses'
const PROPERTY_EMAIL = 'emailAddresses'
const PROPERTY_PHONE = 'phoneNumbers'
const BUSINESS_DESCRIPTION = 'businessDescription'
const PROPERTY_THEME = 'theme'
const PROPERTY_OPT_IN = 'businessOptIn'

const TYPE_MOBILE = 'mobile'
const TYPE_LANDLINE = 'landline'

const VALIDATION_ERROR = 142

const makePhoneType = (type) => ({
  name: 'type',
  types: [TYPE_MOBILE, TYPE_LANDLINE],
  value: type || TYPE_MOBILE,
  showName: 'Type'
})

class BusinessProperty extends Parse.Object {
  constructor () {
    super('BusinessProperty')
  }

  /**
   * @method buildInitialProperties
   * @description Create properties for a new business
   * @param {Parse.User} user - owner of the business
   * @param {string} name - business name
   * @param {string} domain - business url address
   */
  static async buildInitialProperties (user, name, domain) {
    await BusinessProperty.validate(PROPERTY_NAME, name)
    await BusinessProperty.validate(PROPERTY_DOMAIN, domain)
    const properties = []
    properties.push(BusinessProperty.newNameProperty(user, name))
    properties.push(BusinessProperty.newDomainProperty(user, domain))
    return Promise.all(properties)
  }

  static newNameProperty (user, name) {
    const property = new BusinessProperty()
    property.setACL(new Parse.ACL(user))
    property.set('highlander', true)
    property.set('name', PROPERTY_NAME)
    property.set('parameters', {})
    property.set('type', 'text')
    property.set('value', name)
    property.set('exports', true)
    property.set('verified', false)

    return property.save(null, { useMasterKey: true })
  }

  static async newDomainProperty (user, domain) {
    const property = new BusinessProperty()
    property.setACL(new Parse.ACL(user))
    property.set('name', PROPERTY_DOMAIN)
    property.set('type', 'text')
    property.set('exports', true)
    property.set('value', null)
    // Setting parameters because we might want to store some domain data (registraion info, etc)
    const domainParameter = {
      0: {
        name: 'label',
        types: ['homepage', 'company', 'other', 'HeresMyInfo URL'],
        value: 'company',
        showName: 'Label'
      },
      1: {
        name: 'url',
        types: [],
        value: domain,
        showName: 'Domain'
      }
    }
    property.set('parameters', domainParameter)
    property.set('verified', false)
    return property.save(null, { useMasterKey: true })
  }

  static async newEmailProperty (user, email) {
    const property = new BusinessProperty()
    property.setACL(new Parse.ACL(user))
    property.set('name', PROPERTY_EMAIL)
    property.set('type', 'text')
    property.set('exports', true)
    property.set('value', null)
    const emailParameter = {
      0: {
        name: 'label',
        types: ['personal', 'work', 'personal & work'],
        value: 'work',
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
    property.set('verified', false)
    return property.save(null, { useMasterKey: true })
  }

  static newPhoneProperty (user, phone, countryCode, type = TYPE_MOBILE) {
    const property = new BusinessProperty()
    property.setACL(new Parse.ACL(user))
    property.set('name', PROPERTY_PHONE)
    property.set('type', 'text')
    const phoneType = {
      0: {
        name: 'label',
        types: [
          'personal',
          'work',
          'personal & work',
          'cell',
          'fixed'
        ],
        value: 'work',
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
    property.set('verified', false)

    return property.save(null, { useMasterKey: true })
  }

  static newDescriptionProperty (user, name) {
    const property = new BusinessProperty()
    property.setACL(new Parse.ACL(user))
    property.set('name', BUSINESS_DESCRIPTION)
    property.set('parameters', {})
    property.set('type', 'text')
    property.set('value', name)
    property.set('exports', true)
    property.set('verified', true)

    return property.save(null, { useMasterKey: true })
  }

  static newThemeProperty (user, name) {
    const property = new BusinessProperty()
    property.setACL(new Parse.ACL(user))
    property.set('name', PROPERTY_THEME)
    property.set('parameters', {})
    property.set('type', 'text')
    property.set('value', name)
    property.set('exports', true)
    property.set('verified', true)

    return property.save(null, { useMasterKey: true })
  }

  static newOptinProperty (user, name) {
    const property = new BusinessProperty()
    property.setACL(new Parse.ACL(user))
    property.set('name', PROPERTY_OPT_IN)
    property.set('parameters', {})
    property.set('type', 'text')
    property.set('value', name)
    property.set('exports', true)
    property.set('verified', true)

    return property.save(null, { useMasterKey: true })
  }

  static newProperty (user, name, value, rest) {
    switch (name) {
      case PROPERTY_NAME:
        return BusinessProperty.newNameProperty(user, value)
      case PROPERTY_DOMAIN:
        return BusinessProperty.newDomainProperty(user, value)
      case PROPERTY_EMAIL:
        return BusinessProperty.newEmailProperty(user, value)
      case PROPERTY_PHONE:
        return BusinessProperty.newPhoneProperty(user, value, rest.countryCode || '', rest.type || TYPE_MOBILE)
      case BUSINESS_DESCRIPTION:
        return BusinessProperty.newDescriptionProperty(user, value)
      case PROPERTY_THEME:
        return BusinessProperty.newThemeProperty(user, value)
      case PROPERTY_OPT_IN:
        return BusinessProperty.newOptinProperty(user, value)
      default:
        throw new Error(`Business property ${name} is not supported`)
    }
  }

  /**
   * @method getPropertyByValue
   * @description Used to check properties by value existance or unique
   * @param {string} value - value to search
   * @param {string} name - property name
   * @param {string} verified - verified status of the field - optional: true looks for verified field == true properties
   * @param {string} user - properties user context
   */
  static async getPropertyByValue (value, name, verified, user) {
    const query = new Parse.Query(BusinessProperty)
    query.equalTo('name', name)
    if (verified) {
      query.equalTo('verified', true)
    }
    const valueQuery = new Parse.Query(BusinessProperty)
    valueQuery.equalTo('value', value)
    const parametersQuery = new Parse.Query(BusinessProperty)
    parametersQuery.equalTo('parameters.1.value', value.replace('\'', '\'\''))
    const finalQuery = Parse.Query.and(
      query,
      Parse.Query.or(valueQuery, parametersQuery)
    )

    const properties = await finalQuery.find({ useMasterKey: true })
    for (const property of properties) {
      if (!user) {
        return property
      }
      const ACLarray = Object.values(property.get('ACL'))
      const ACLUserIds = ACLarray.map(acl => (Object.keys(acl)[0]))
      if (ACLUserIds.indexOf(user.id) !== -1) {
        return property
      }
    }
  }
  /**
   * @method validate
   * @description Validate property value
   * @param {string} name - property name
   * @param {string} value - property value
   * @param {string} objectId - provide object id if update operation
   */

  static async validate (name, value, objectId = null) {
    // Validate value
    let isValid
    switch (name) {
      case PROPERTY_NAME:
        isValid = await validateName(value)
        if (!isValid) {
          throw new Parse.Error(VALIDATION_ERROR, 'Invalid business name')
        }
        break
      case PROPERTY_DOMAIN:
        isValid = await validateDomain(value)
        if (!isValid) {
          throw new Parse.Error(VALIDATION_ERROR, 'Invalid domain')
        }
        break
      case PROPERTY_EMAIL:
        isValid = await validateEmail(value)
        if (!isValid) {
          throw new Parse.Error(VALIDATION_ERROR, 'Invalid email')
        }
        break
      case PROPERTY_PHONE:
        isValid = await validatePhone(value)
        if (!isValid) {
          throw new Parse.Error(VALIDATION_ERROR, 'Invalid phone number')
        }
        break
      case BUSINESS_DESCRIPTION:
        isValid = await validateName(value)
        if (!isValid) {
          throw new Parse.Error(VALIDATION_ERROR, 'Invalid business description')
        }
        break
      case PROPERTY_THEME:
        isValid = await validateName(value)
        if (!isValid) {
          throw new Parse.Error(VALIDATION_ERROR, 'Invalid theme')
        }
        break
      case PROPERTY_OPT_IN:
        isValid = await validateName(value)
        if (!isValid) {
          throw new Parse.Error(VALIDATION_ERROR, 'Invalid optin')
        }
        break
    }

    // Validate that the value is unique (over verified values)
    const foundProperty = await BusinessProperty.getPropertyByValue(value, name, true)
    if (foundProperty && foundProperty.id !== objectId) {
      throw new Parse.Error(VALIDATION_ERROR, `Verified property ${name} is already used`)
    }
  }

  async initVerification () {
    // Don't send SMS to landline
    if (this.get('verified') === true) {
      return
    }
    const Business = require('./business')
    const relatedBusiness = await Business.getByProperty(this)
    const user = await relatedBusiness.getOwner()
    switch (this.get('name')) {
      case PROPERTY_EMAIL:
        await Message.sendVerificationBusinessEmail(user, relatedBusiness, this)
        break
      case PROPERTY_PHONE:
        try {
          const args = {
            phone: this.get('parameters')[1].value
          }
          await PhoneVerification.startPhoneVerification(args)
        } catch (err) {
          console.error(`[BusinessProperty:initVerification] Failed to send SMS with err ${err.toString()}`)
        }
        break
      case PROPERTY_DOMAIN:
        const key = await nanoid()
        const meta = this.has('meta') ? Object.assign({}, this.get('meta')) : {}
        meta.verification = {
          name: '_heresmyinfokey',
          value: key
        }
        await this.save('meta', meta, { useMasterKey: true })
        break
    }
  }

  /**
   * @method getBusiness
   * @description - get the business current property belongs to
   */
  async getBusiness (includes = []) {
    const businessQuery = new Parse.Query('Business')
    businessQuery.equalTo('properties', this)
    for (const include of includes) {
      businessQuery.include(include)
    }
    const business = await businessQuery.first({ useMasterKey: true })
    return business
  }
}

Parse.Object.registerSubclass('BusinessProperty', BusinessProperty)

/**
 * @kind cloud
 * @description this verifies field values and ensures there are no duplicate verified fields
 * Mark property as not verified on value update
 * Don't allow to modify name after it was verified
 **/
Parse.Cloud.beforeSave('BusinessProperty', async function (request, response) {
  const { object: property, original: oldProperty } = request

  // Validate the value and ensure there are no duplicate verified fields
  let value
  if (property.get('parameters') && property.get('parameters')[1]) {
    value = property.get('parameters')[1].value
  } else {
    value = property.get('value')
  }
  try {
    await BusinessProperty.validate(property.get('name'), value, property.id)
  } catch (err) {
    return response.error(err.message)
  }

  // Mark property as not verified on value update
  if (property.isNew()) {
    property.set('verified', false)
  } else {
    if (property.dirty('parameters') && property.get('parameters')[1] && oldProperty.get('parameters')[1]) {
      if (property.get('parameters')[1].value !== oldProperty.get('parameters')[1].value) {
        property.set('verified', false)
      }
    }
    if (property.dirty('value') && property.get('value') !== oldProperty.get('value')) {
      property.set('verified', false)
    }
  }

  // Mark landline as verified
  // When changed landline -> mobile, mark as not verified
  if (property.get('name') === PROPERTY_PHONE) {
    const type = (property.get('parameters') && property.get('parameters')[3]) || {}
    // If landline is not verified - set verified
    if (type.value === TYPE_LANDLINE && property.get('verified') !== true) {
      property.set('verified', true)
    }
    // If mobile and verified and WAS landline - set not verified
    if (type.value === TYPE_MOBILE && property.get('verified') === true) {
      if (oldProperty && oldProperty.get('parameters') &&
          oldProperty.get('parameters')[3] &&
          oldProperty.get('parameters')[3].value === TYPE_LANDLINE
      ) {
        property.set('verified', false)
      }
    }
  }

  // HMI-749 allow editing name, ignoring name verification
  // Don't allow to modify name after it was verified
  // if (!property.isNew() &&
  //   property.get('name') === PROPERTY_NAME &&
  //   property.dirty('value') &&
  //   oldProperty.get('verified') === true
  // ) {
  //   return response.error('Changing verified name is forbidden. Please contact support@heresmyinfo.com.')
  // }

  return response.success()
})

/**
 * @kind cloud
 * @description send verification
 **/
Parse.Cloud.afterSave('BusinessProperty', async function (request) {
  const { object: property, original: oldProperty } = request
  // Mark property as not verified on value update
  if (property.isNew() || !oldProperty) {
    // Can't verify new property from this point because it has not yet been assigned to busines
  } else {
    if (property.get('parameters')[1] && !oldProperty.get('parameters')[1]) {
      property.initVerification()
    } else if (property.get('parameters')[1] && property.get('parameters')[1].value !== oldProperty.get('parameters')[1].value) {
      property.initVerification()
    } else if (property.get('value') && property.get('value') !== oldProperty.get('value')) {
      property.initVerification()
    } else if (property.get('parameters')[3] && oldProperty.get('parameters')[3] &&
                property.get('parameters')[3].value === TYPE_MOBILE &&
                oldProperty.get('parameters')[3].value === TYPE_LANDLINE
    ) {
      // init verification on phone number landline->mobile switch
      property.initVerification()
    }
  }

  // If domain was verified, mark business as verified (if it is pending and not disabled)
  // if (property.get('name') === PROPERTY_DOMAIN && property.get('verified')) {
  //   const business = await property.getBusiness()
  //   if (business.get('state') === 'pending') {
  //     await business.save('state', 'verified', { useMasterKey: true })
  //   }
  // }
})

/**
 * @function newBusinessProperty
 * @description [usage WEB] create a new business property
 * @kind Cloud Function
 * @param {string} businessId Company id
 * @param {string} name Property name
 * @param {string} value Property value
 */
Parse.Cloud.define('newBusinessProperty', async function (request, response) {
  if (!request.user) {
    return response.error('Must be signed up and logged in to call newBusinessProperty.')
  }
  const user = request.user
  const businessId = request.params.businessId
  const name = request.params.name
  const value = request.params.value
  const rest = request.params.rest || {}
  if (!name || !value) {
    return response.error('Specify property value')
  }

  try {
    const businessQuery = new Parse.Query('Business')
    businessQuery.include('defaultCircle')
    businessQuery.include('properties')
    const business = await businessQuery.get(businessId, user.sessionOptions())
    // This check should be moved in beforesave hook or we need to support multiple bussiness props per type
    const alreadyHas = business.get('properties').filter(p => p.get('name') === name).length > 0
    if (alreadyHas) {
      return response.error('At this moment only single properties are supported, you already have property ' + name)
    }
    const property = await BusinessProperty.newProperty(user, name, value, rest)

    business.addUnique('properties', property)
    await business
      .get('defaultCircle')
      .addUnique('properties', property)
      .save(null, { useMasterKey: true })
    await business.save(null, { useMasterKey: true })
    property.initVerification()
    return response.success({ property })
  } catch (error) {
    return response.error(error)
  }
})

/**
 * @function editBusinessProperty
 * @description [usage WEB] edit the business property
 * @kind Cloud Function
 * @param {string} id Property id
 * @param {string} value Property value
 */
Parse.Cloud.define('editBusinessProperty', async function (request, response) {
  if (!request.user) {
    return response.error('Must be signed up and logged in to call editBusinessProperty.')
  }
  const user = request.user
  const id = request.params.id
  const value = request.params.value
  const rest = request.params.rest || {}
  if (!value) {
    return response.error('Specify property value')
  }

  try {
    const propertyQuery = new Parse.Query('BusinessProperty')
    const property = await propertyQuery.get(id, user.sessionOptions())
    if (property.get('parameters')[1]) {
      let parameters = property.get('parameters')
      parameters[1].value = value
      if (property.get('name') === PROPERTY_PHONE) {
        if (rest.countryCode) {
          parameters[2].value = rest.countryCode
        }
        // Phone type support + BC check
        if (!parameters[3] || parameters[3].name !== 'type') {
          parameters = pushAtIndex(parameters, 3, makePhoneType(TYPE_MOBILE))
        }
        if (rest.type) {
          parameters[3].value = rest.type
        }
      }
      property.set('parameters', parameters)
    } else {
      property.set('value', value)
    }
    await property.save(null, { useMasterKey: true })
    return response.success({ property })
  } catch (error) {
    return response.error(error)
  }
})

/**
 * @function dispatchBusinessPropertyVerification
 * @description [usage WEB] dispatch business property verification: send email, send sms, etc
 * @kind Cloud Function
 * @param {string} id Property id
 */
Parse.Cloud.define('dispatchBusinessPropertyVerification', async function (request, response) {
  if (!request.user) {
    return response.error('Must be signed up and logged in to call dispatchBusinessPropertyVerification.')
  }
  const user = request.user
  const id = request.params.id
  try {
    const propertyQuery = new Parse.Query('BusinessProperty')
    const property = await propertyQuery.get(id, user.sessionOptions())
    await property.initVerification()
    return response.success({ property })
  } catch (error) {
    return response.error(error)
  }
})

/**
 * @function verifyBusinessProperty
 * @description [usage WEB] verify business property
 * @kind Cloud Function
 * @param {string} id Property id
 * @param {string} code Verification code (required for some types)
 */
Parse.Cloud.define('verifyBusinessProperty', async function (request, response) {
  const user = request.user
  const id = request.params.id
  try {
    const propertyQuery = new Parse.Query(BusinessProperty)
    const queryOptions = user ? user.sessionOptions() : { useMasterKey: true }
    const property = await propertyQuery.get(id, queryOptions)
    // If we verify email, we allow to be not logged in
    if (!user && property.get('name') !== PROPERTY_EMAIL) {
      return response.error('Must be signed up and logged in to call verifyBusinessProperty.')
    }
    if (property.get('verified') === true) {
      return response.success({ property, success: true })
    }
    let success = false
    switch (property.get('name')) {
      case PROPERTY_EMAIL:
        const message = await Message.fetchMessage(null, request.params.code)
        if (message.get('data') === property.get('parameters')[1].value) {
          success = true
        }
        break
      case PROPERTY_PHONE:
        const phoneValue = property.get('parameters')[1].value
        const args = {
          countryCode: property.get('parameters')[2].value,
          phone: phoneValue.startsWith('+') ? phoneValue.substring(1) : phoneValue,
          token: request.params.code
        }
        try {
          const result = await PhoneVerification.verifyPhone(args)
          success = result
        } catch (e) {
          console.log(`SMS verification failed: ${e.toString()}`)
          // @todo handle error, for now we will just return success false
        }
        break
      case PROPERTY_DOMAIN:
        try {
          // @todo this should be done by cron; on cron success send an email to the owner
          const resolveTxt = util.promisify(dns.resolveTxt)
          const testDns = async (hostname) => {
            let record
            try {
              record = await resolveTxt(hostname)
            } catch (err) {
              return false
            }
            return record.some(item => item.join('') === property.get('meta').verification.value)
          }
          const key = property.get('meta').verification.name
          let hostname = `${key}.${property.get('parameters')[1].value}`
          success = await testDns(hostname)
          if (!success && property.get('parameters')[1].value.startsWith('www.')) {
            hostname = `${key}.${property.get('parameters')[1].value.slice(4)}`
            success = await testDns(hostname)
          }
          if (!success) {
            return response.error('DNS record not found')
          }
        } catch (e) {
          return response.error('DNS record not found')
        }
    }
    if (success) {
      await property.save('verified', true, { useMasterKey: true })
    }
    return response.success({ property, success })
  } catch (error) {
    return response.error(error)
  }
})

module.exports = BusinessProperty
module.exports.PROPERTY_NAME = PROPERTY_NAME
module.exports.PROPERTY_DOMAIN = PROPERTY_DOMAIN
