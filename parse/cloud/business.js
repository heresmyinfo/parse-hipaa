const probe = require('probe-image-size')
const BusinessCircle = require('./businessCircle')
const BusinessProperty = require('./businessProperty')
const GCSAdapter = require('./modules/GCSAdapter')

const STATE_PENDING = 'pending'
const STATE_VERIFIED = 'verified'
const STATE_DISABLED = 'disabled'

const BUSINESS_LOGO_MIN_WIDTH = 300

const getTplPath = template => `${process.env.WEB_SERVER_URL}/public/templates/${template || 'default'}.html`

/**
 * @class Business
 * @description Business accounts
 */
class Business extends Parse.Object {
  constructor () {
    super('Business')
  }

  /**
   * @method createNewBusiness
   * @description - create a new company assigned to the user with provided name and domain
   * @param {Parse.User} user - Owner of the business
   * @param {string} name  - name of the business
   * @param {string} domain - web url of the business
   */
  static async createNewBusiness (user, name, domain) {
    const properties = await BusinessProperty.buildInitialProperties(user, name, domain)
    const circle = await BusinessCircle.createPublicCircle(user, properties)

    const business = new Business()
    const nameProperty = properties.filter(p => p.get('name') === BusinessProperty.PROPERTY_NAME)[0]
    business.setACL(new Parse.ACL(user))
    business.set('name', nameProperty)
    business.set('state', STATE_PENDING)
    properties.forEach(prop => business.addUnique('properties', prop))
    business.set('defaultCircle', circle)
    business.add('circles', circle)
    await business.save(null, { useMasterKey: true })
    properties.forEach(prop => prop.initVerification())
    return business
  }

  /**
   * @method getByProperty
   * @description - Get business record by related property
   */
  static async getByProperty (property) {
    const bQuery = new Parse.Query(Business)
    bQuery.equalTo('properties', property)
    const business = await bQuery.first({ useMasterKey: true })
    return business
  }

  /**
   * @method getOwner
   * @description - get the owner (Parse.User) of current business
   */
  async getOwner (includes = []) {
    const userQuery = new Parse.Query(Parse.User)
    userQuery.equalTo('businesses', this)
    for (const include of includes) {
      userQuery.include(include)
    }
    const user = await userQuery.first({ useMasterKey: true })
    return user
  }

  /**
   * @method deleteLogoFile
   * @param {string} name - name of file to delete
   * @description - delete logo file from GCP
   */
  static async deleteLogoFile (name) {
    GCSAdapter.deleteFile(name)
    // @todo delete size invariants starting with prefix `${name}.width-`
  }
}

Parse.Object.registerSubclass('Business', Business)

module.exports = Business

/**
 * @function createBusiness
 * @description [usage WEB] create a new business record
 * @kind Cloud Function
 * @param {string} name
 * @param {string} domain
 */
Parse.Cloud.define('createBusiness', async function (request, response) {
  if (!request.user) {
    return response.error('Must be signed up and logged in to call createBusiness.')
  }
  const user = request.user
  const name = request.params.name
  const domain = request.params.domain
  if (!name || !domain) {
    return response.error('Must have at minimum a name and domain to create a Business.')
  }

  try {
    const business = await Business.createNewBusiness(user, name, domain)
    user.add('businesses', business)
    await user.save(null, { useMasterKey: true })
    return response.success({ business })
  } catch (error) {
    return response.error(error)
  }
})

/**
 * @function getBusiness
 * @description [usage WEB] get single business with properties
 * @kind Cloud Function
 */
Parse.Cloud.define('getBusiness', async function (request, response) {
  const user = request.user
  const id = request.params.id

  try {
    const query = new Parse.Query(Business)
    query.equalTo('objectId', id)
    query.include('circles')
    query.include('properties')
    const business = await query.first({ useMasterKey: true })
    const templatePath = getTplPath(business.get('template'))
    return response.success({ business, templatePath })
  } catch (error) {
    return response.error(error)
  }
})

/**
 * @function getBusinesses
 * @description [usage WEB] get list of owned businesses
 * @kind Cloud Function
 */
Parse.Cloud.define('getBusinesses', async function (request, response) {
  if (!request.user) {
    return response.error('Must be signed up and logged in to call getBusinesses.')
  }
  const user = request.user

  try {
    const query = new Parse.Query(Business)
    query.include('name')
    const businesses = await query.find(user.sessionOptions())
    return response.success({ businesses })
  } catch (error) {
    return response.error(error)
  }
})

/**
 * @function getAllBusinesses
 * @description [usage Mobile] get list of businesses properties, without circle name involved.
 * For now, all properties are taken.
 * @kind Cloud Function
 */
Parse.Cloud.define('getAllBusinesses', async function (request, response) {
  if (!request.user) {
    return response.error('Must be signed up and logged in to call getBusinesses.')
  }
  try {
    const query = new Parse.Query(Business)
    query.include('name')
    query.include('properties')
    query.equalTo('state', STATE_VERIFIED)
    const businesses = await query.find({ useMasterKey: true })
    const output = businesses.map((business) => {
      const props = business.get('properties')
      props.push({ name: 'templatePath', value: getTplPath(business.get('template')) })
      props.push({ name: 'objectId', value: business.id })
      if (business.get('logo')) {
        props.push({ name: 'logo', value: business.get('logo') })
      }
      return props
    })

    return response.success(output)
  } catch (error) {
    return response.error(error)
  }
})

/**
 * @function storeBusinessLogo
 * @description [usage WEB] assign uploaded logo to particular business
 * @param {string} id - Business id
 * @param {Parse.File} parseFile - uploaded logo
 * @kind Cloud Function
 */
Parse.Cloud.define('storeBusinessLogo', async function (request, response) {
  const user = request.user
  const id = request.params.id
  const parseFile = request.params.parseFile
  try {
    const query = new Parse.Query(Business)
    query.include('properties')
    const business = await query.get(id, user.sessionOptions())

    const allowedMimes = ['image/jpeg', 'image/gif', 'image/png', 'image/svg+xml']
    let result
    try {
      result = await probe(parseFile.url())
    } catch (error) {
      Business.deleteLogoFile(parseFile.name())
      return response.error('Unsupported file format. Please upload jpeg, png or gif image.')
    }
    if (!allowedMimes.includes(result.mime)) {
      Business.deleteLogoFile(parseFile.name())
      return response.error('Unsupported file format. Please upload jpeg, png or gif image.')
    }
    if (result.width < BUSINESS_LOGO_MIN_WIDTH) {
      Business.deleteLogoFile(parseFile.name())
      return response.error(`Logo image must be at least ${BUSINESS_LOGO_MIN_WIDTH}px width.`)
    }

    const oldLogo = business.get('logo')
    await business.save('logo', parseFile, { useMasterKey: true })
    if (oldLogo) {
      Business.deleteLogoFile(oldLogo.name())
    }
    const templatePath = getTplPath(business.get('template'))
    return response.success({ business, templatePath })
  } catch (error) {
    return response.error(error)
  }
})

module.exports.STATE_PENDING = STATE_PENDING
module.exports.STATE_VERIFIED = STATE_VERIFIED
module.exports.STATE_DISABLED = STATE_DISABLED
module.exports.getTplPath = getTplPath
