require("./patient.js");
require("./contact.js");
require("./carePlan.js");
require("./task.js");
require("./outcome.js");
require("./outcomeValue.js");
require("./note.js");
// require('./files.js');
var _ = require("underscore");

var numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
var people = [
  { name: "John", age: 30 },
  { name: "Jane", age: 28 },
  { name: "Bob", age: 35 },
  { name: "Alice", age: 25 },
];

var over30 = _.find(people, function (person) {
  return person.age > 30;
});
console.log("First person over 30:", over30);

Parse.Cloud.job("testPatientRejectDuplicates", (request) => {
  const { params, headers, log, message } = request;

  const object = new Parse.Object("Patient");
  object.set("objectId", "112");
  object
    .save({ useMasterKey: true })
    .then((result) => {
      message("Saved patient");
    })
    .catch((error) => message(error));
});

Parse.Cloud.job("testCarePlanRejectDuplicates", (request) => {
  const { params, headers, log, message } = request;

  const object = new Parse.Object("CarePlan");
  object.set("objectId", "112");
  object
    .save({ useMasterKey: true })
    .then((result) => {
      message("Saved carePlan");
    })
    .catch((error) => message(error));
});

Parse.Cloud.job("testContactRejectDuplicates", (request) => {
  const { params, headers, log, message } = request;

  const object = new Parse.Object("Contact");
  object.set("objectId", "112");
  object
    .save({ useMasterKey: true })
    .then((result) => {
      message("Saved contact");
    })
    .catch((error) => message(error));
});

Parse.Cloud.job("testTaskRejectDuplicates", (request) => {
  const { params, headers, log, message } = request;

  const object = new Parse.Object("Task");
  object.set("objectId", "112");
  object
    .save({ useMasterKey: true })
    .then((result) => {
      message("Saved task");
    })
    .catch((error) => message(error));
});

Parse.Cloud.job("testOutcomeRejectDuplicates", (request) => {
  const { params, headers, log, message } = request;

  const object = new Parse.Object("Outcome");
  object.set("objectId", "112");
  object
    .save({ useMasterKey: true })
    .then((result) => {
      message("Saved outcome");
    })
    .catch((error) => message(error));
});
