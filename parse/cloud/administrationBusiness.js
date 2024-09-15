const isAdminOrFail = require('./administration').isAdminOrFail
const BusinessProperty = require('./businessProperty')
const Business = require('./business')

/**
 * @function getBusinessesWithProperties
 * @description [usage WEB] - used on admin page - get all businesses for current page with their properties
 * @kind Cloud Function
 * @param {int} perPage - number of users per page
 * @param {int} page - current page (starts from 0)
 * @param {string} search - optional search query
 */
Parse.Cloud.define('getBusinessesWithProperties', async (request, response) => {
  try {
    if (!isAdminOrFail(request, response)) {
      return null
    }
    const perPage = Math.min(50, parseInt(request.params.perPage) || 5)
    const page = parseInt(request.params.page) || 0 // from 0
    const searchTerm = (request.params.search || '').trim()
    let mainQuery

    if (searchTerm.length >= 3) {
      // @todo search not implemented yet
      mainQuery = new Parse.Query('Business')
    } else {
      mainQuery = new Parse.Query('Business')
    }

    const total = await mainQuery.count({ useMasterKey: true })

    mainQuery.include('name')
    mainQuery.include('properties')
    mainQuery.limit(perPage)
    mainQuery.skip(perPage * (page))
    mainQuery.descending('createdAt')
    const businesses = await mainQuery.find({ useMasterKey: true })

    // Owners
    const userQuery = new Parse.Query(Parse.User)
    userQuery.containedIn('businesses', businesses)
    userQuery.include('profile.properties')
    userQuery.include('businesses')
    userQuery.select(['businesses', 'profile.properties'])
    const owners = await userQuery.find({ useMasterKey: true })

    return response.success({ owners, businesses, total })
  } catch (error) {
    return response.error(error)
  }
})

/**
 * @function verifyBusinessName
 * @description [usage WEB] - used on admin page - mark business name as verified
 * @kind Cloud Function
 * @param {string} objectId - id of the name property
 * @param {bool} verified - new verified value
 */
Parse.Cloud.define('verifyBusinessName', async (request, response) => {
  try {
    if (!isAdminOrFail(request, response)) {
      return null
    }
    const { objectId, verified } = request.params
    const propertyQuery = new Parse.Query(BusinessProperty)
    const property = await propertyQuery.get(objectId, { useMasterKey: true })
    if (property.get('name') !== BusinessProperty.PROPERTY_NAME) {
      return response.error('You can use this method only to verify business name')
    }
    await property.save('verified', verified, { useMasterKey: true })

    const businessQuery = new Parse.Query(Business)
    businessQuery.equalTo('properties', property)
    businessQuery.include('name')
    businessQuery.include('properties')
    const business = await businessQuery.first({ useMasterKey: true })

    return response.success({ business })
  } catch (error) {
    return response.error(error)
  }
})

/**
 * @function changeBusinessState
 * @description [usage WEB] - used on admin page - change business state
 * @kind Cloud Function
 * @param {string} objectId - id of the business
 * @param {string} state - new state of the business
 */
Parse.Cloud.define('changeBusinessState', async (request, response) => {
  try {
    if (!isAdminOrFail(request, response)) {
      return null
    }
    const { objectId, state } = request.params
    if (![
      Business.STATE_DISABLED,
      Business.STATE_PENDING,
      Business.STATE_VERIFIED
    ].includes(state)) {
      return response.error(`Unsupported state '${state}'`)
    }
    const businessQuery = new Parse.Query(Business)
    businessQuery.include('name')
    businessQuery.include('properties')
    const business = await businessQuery.get(objectId, { useMasterKey: true })

    await business.save('state', state, { useMasterKey: true })

    return response.success({ business })
  } catch (error) {
    return response.error(error)
  }
})

/**
 * @function adminGetBusiness
 * @description [usage WEB] get single business with properties as an admin
 * @param {string} objectId - id of the business
 * @kind Cloud Function
 */
Parse.Cloud.define('adminGetBusiness', async function (request, response) {
  if (!isAdminOrFail(request, response)) {
    return null
  }
  try {
    const id = request.params.objectId
    const query = new Parse.Query(Business)
    query.include('name')
    query.include('properties')
    const business = await query.get(id, { useMasterKey: true })
    const templatePath = Business.getTplPath(business.get('template'))
    const owner = await business.getOwner(['profile.properties'])
    return response.success({ business, templatePath, owner })
  } catch (error) {
    return response.error(error)
  }
})
