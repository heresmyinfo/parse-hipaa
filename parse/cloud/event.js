/**
 * @class Event
 * @description Simple event tracking and logging model
 */
class Event extends Parse.Object {
  constructor () {
    super('Event')
  }

  /**
   * @method createEvent
   * @description Create event
   * @param {Parse.User?} user
   * @param {string} name
   * @param {string} platform
   * @param {string} version
   * @param {Object} parameters
   */
  static createEvent (user, name, platform, version, parameters) {
    const event = new Event()

    event.setACL(new Parse.ACL())
    event.set('name', name)
    event.set('user', user)
    event.set('platform', platform)
    event.set('version', version)
    event.set('parameters', parameters)

    return event.save(null, { useMasterKey: true })
  }
}

Parse.Object.registerSubclass('Event', Event)

module.exports = Event

/**
 * @function createEvent
 * @description [usage Mobile] create event in db
 * @param {string} name Event name
 * @param {string} platform Reporting platform (iOS, Android, Web)
 * @param {string} version App version
 * @param {Object} parameters Extra parameters
 * @kind Cloud Function
 */
Parse.Cloud.define('createEvent', async function (request, response) {
  const user = request.user
  const { name, platform, version, parameters } = request.params

  try {
    const event = await Event.createEvent(user, name, platform, version, parameters)

    return response.success({ event })
  } catch (error) {
    return response.error(error)
  }
})
