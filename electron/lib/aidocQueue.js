'use strict'

function createCoalescingRunner(task) {
  let active
  let rebuild

  function start(options) {
    const run = { full: Boolean(options.full) }
    active = run
    run.promise = Promise.resolve().then(() => task(options)).finally(() => {
      active = undefined
      if (rebuild) {
        const next = rebuild
        rebuild = undefined
        start(next.options).then(next.resolve, next.reject)
      }
    })
    return run.promise
  }

  return function run(options = {}) {
    if (!active) return start(options)
    if (!options.full || active.full) return active.promise
    if (!rebuild) {
      rebuild = { options }
      rebuild.promise = new Promise((resolve, reject) => Object.assign(rebuild, { resolve, reject }))
    }
    return rebuild.promise
  }
}

module.exports = { createCoalescingRunner }
