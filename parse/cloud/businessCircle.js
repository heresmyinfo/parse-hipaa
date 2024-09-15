/**
 * @class BusinessCircle
 * @description Circles for business accounts
 */
class BusinessCircle extends Parse.Object {
  constructor () {
    super('BusinessCircle')
  }

  /**
   * @method createPublicCircle
   * @description Create default public circle for a business
   * @param {Parse.User} user - owner of the business
   * @param {Array<BusinessProperty>} properties - circle properties
   */
  static createPublicCircle (user, properties) {
    const circle = new BusinessCircle()

    circle.setACL(new Parse.ACL(user))
    circle.set('name', 'Public')
    circle.set('properties', properties)
    circle.set('defaultCircle', true)

    return circle.save(null, { useMasterKey: true })
  }
}

Parse.Object.registerSubclass('BusinessCircle', BusinessCircle)

/**
 * @function toggleBusinessProperty
 * @description [usage WEB] add property to circle or remove
 * @param {string} circleId - Business Circle id
 * @param {string} propertyId - Business Property id
 * @param {boolean} toggle - uploaded logo
 * @kind Cloud Function
 */
Parse.Cloud.define('toggleBusinessProperty', async function (request, response) {
  const user = request.user
  const circleId = request.params.circleId
  const propertyId = request.params.propertyId
  const toggle = request.params.toggle
  try {
    const circleQuery = new Parse.Query(BusinessCircle)
    const circle = await circleQuery.get(circleId, user.sessionOptions())

    const propertyQuery = new Parse.Query('BusinessProperty')
    const property = await propertyQuery.get(propertyId, user.sessionOptions())

    if (toggle) {
      circle.addUnique('properties', property)
    } else {
      circle.remove('properties', property)
    }
    await circle.save(null, { useMasterKey: true })

    return response.success({ success: true })
  } catch (error) {
    return response.error(error)
  }
})

module.exports = BusinessCircle
