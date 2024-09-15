

/**
 * @class Faq
 * @description Frequently Asked Questions
 */
class FAQ extends Parse.Object {
  constructor () {
    super('FAQ')
  }

  /**
   * @method createNewFAQ
   * @description - create a new frequently asked question
   * @param {string} title  - title of the question
   * @param {string} content - answer to the question
   * @param {int} order - order of the question
   */
  static async createNewFAQ (title, content, order) {
    const newFaq = new FAQ()
    newFaq.setACL(new Parse.ACL())
    newFaq.set('title', title)
    newFaq.set('content', content)
    newFaq.set('order', order)
    await newFaq.save(null, { useMasterKey: true })
    return newFaq
  }
}

Parse.Object.registerSubclass('FAQ', FAQ)

module.exports = FAQ

/**
 * @function createFAQ
 * @description create a new FAQ
 * @kind Cloud Function
 * @param {string} title
 * @param {string} content
 * @param {int} order
 */
Parse.Cloud.define('createFAQ', async function (request, response) {
  if (!request.user) {
    return response.error('Must be logged in to call createFAQ.')
  }
  let user = request.user
  const { title, content, order } = request.params

  console.log("title: ",title)
  console.log("content: ",content)
  console.log("order: ",order)

  // YO
  
  if (!title || !content || !order) {
    return response.error('Must have title, content and order to create a FAQ.')
  }

  try {
    const result = await FAQ.createNewFAQ(title, content, order)
    user.add('faqs', result)
    await user.save(null, { useMasterKey: true })
    return response.success({ result })
  } catch (error) {
    return response.error(error)
  }
})

/**
 * @function getFAQs
 * @description get all FAQs
 * @kind Cloud Function
 */
Parse.Cloud.define('getFaqs', async function (request, response) {

  try {
    const query = new Parse.Query(FAQ)
    query.include('objectId')
    query.include('title')
    query.include('content')
    query.include('order')
    const faqs = await query.find({ useMasterKey: true })
    console.log(faqs)
    return response.success({ faqs })
  } catch (error) {
    return response.error(error)
  }
})

/**
 * @function editFAQ
 * @description edit a FAQ
 * @kind Cloud Function
 */
Parse.Cloud.define('editFaq', async function (request, response) {
  if (!request.user) {
    return response.error('Must be logged in to call getFaqs.')
  }
  let user = request.user
  const { objectId, title, content, order } = request.params

  console.log("objectId: ",objectId)
  console.log("title: ",title)
  console.log("content: ",content)
  console.log("order: ",order)

  try {
    const query = new Parse.Query(FAQ)
    query.include('title')
    query.include('content')
    query.include('order')
    const result = await query.get( objectId, { useMasterKey: true })
    console.log(result)
    await result.save('title', title, { useMasterKey: true })
    await result.save('content', content, { useMasterKey: true })
    await result.save('order', order, { useMasterKey: true })
    return response.success({ result })
  } catch (error) {
    return response.error(error)
  }
})

/**
 * @function editFAQ
 * @description edit a FAQ
 * @kind Cloud Function
 */
Parse.Cloud.define('removeFaq', async function (request, response) {
  if (!request.user) {
    return response.error('Must be logged in to call getFaqs.')
  }
  let user = request.user
  const { objectId } = request.params

  console.log("objectId: ",objectId)

  try {
    const query = new Parse.Query(FAQ)
    const result = await query.get( objectId, { useMasterKey: true })
    console.log(result)
 
    await result.destroy({ useMasterKey: true })
    return response.success({ result })
  } catch (error) {
    return response.error(error)
  }
})

