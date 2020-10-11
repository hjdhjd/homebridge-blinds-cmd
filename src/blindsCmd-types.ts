/* Copyright(C) 2020, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * blindsCmd-types.ts: Type definitions for homebridge-blinds-cmd.
 */

export interface BlindsCmdConfigInterface {
  blinds: BlindConfig[]
}

// Plugin configuration options.
export interface BlindConfigInterface {
  transitionInterval: number,
  down: string,
  name: string,
  manufacturer: string,
  model: string,
  refreshRate: number,
  serial: string,
  status: string,
  stop: string,
  up: string
}

// This type declaration make all properties optional recursively including nested objects. This should
// only be used on JSON objects only. Otherwise...you're going to end up with class methods marked as
// optional as well. Credit for this belongs to: https://github.com/joonhocho/tsdef. #Grateful
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Array<infer I> ? Array<DeepPartial<I>> : DeepPartial<T[P]>
};

// We use types instead of interfaces here because we can more easily set the entire thing as readonly.
// Unfortunately, interfaces can't be quickly set as readonly in Typescript without marking each and
// every property as readonly along the way.
export type BlindsCmdConfig = Readonly<BlindsCmdConfigInterface>;
export type BlindConfig = Readonly<BlindConfigInterface>;
