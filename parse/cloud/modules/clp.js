const setCLP = (className, clp) => {
  if (!clp) {
    return Promise.resolve()
  }

  // this approach is used by the dashboard.
  // see: https://github.com/parse-community/parse-dashboard/blob/master/src/lib/stores/SchemaStore.js
  return Parse._request(
    'PUT',
    'schemas/' + className,
    { classLevelPermissions: clp },
    { useMasterKey: true }
  )
}

module.exports = setCLP
