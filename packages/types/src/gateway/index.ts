/**
 * Gateway payload shapes.
 *
 * @remarks
 * Pure types. The gateway's enum-like values — opcodes, close codes, intents and dispatch
 * event names — live in `../enums/` so that runtime emission stays confined to one place.
 */

export * from './dispatch.js'
export * from './payloads.js'
