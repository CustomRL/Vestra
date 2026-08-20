import type { Snowflake } from '../globals.js'
import type { ChannelType } from '../enums/channel.js'
import type { ButtonStyle, ComponentType, TextInputStyle } from '../enums/component.js'
import type { APIPartialEmoji } from './emoji.js'

/**
 * Interactive message components.
 *
 * @remarks
 * This file covers the original interactive components (types 1 to 8). The Components v2
 * layout and content components — sections, containers, media galleries — are not modelled
 * yet; a message using them is still parsed, but its `components` array will not narrow
 * usefully. Tracked separately.
 */

/**
 * A top-level row holding up to five interactive components.
 *
 * @remarks
 * A row may hold either up to five buttons, or exactly one select menu. Mixing the two in
 * one row is rejected by the API.
 */
export interface APIActionRowComponent<Child> {
  /** Always {@link ComponentType.ActionRow}. */
  type: typeof ComponentType.ActionRow
  /** An optional identifier for the component. */
  id?: number
  /** The components in this row. */
  components: Child[]
}

/**
 * Fields shared by every button.
 */
export interface APIButtonComponentBase<Style extends ButtonStyle> {
  /** Always {@link ComponentType.Button}. */
  type: typeof ComponentType.Button
  /** An optional identifier for the component. */
  id?: number
  /** The button's visual style. */
  style: Style
  /** The text on the button, up to 80 characters. */
  label?: string
  /** An emoji shown on the button. */
  emoji?: APIPartialEmoji
  /** Whether the button is greyed out and non-interactive. */
  disabled?: boolean
}

/**
 * A button that emits an interaction when pressed.
 */
export interface APIButtonComponentWithCustomId extends APIButtonComponentBase<
  Exclude<ButtonStyle, typeof ButtonStyle.Link | typeof ButtonStyle.Premium>
> {
  /**
   * A developer-defined identifier, up to 100 characters.
   *
   * @remarks
   * Sent back on the resulting interaction. This is the only channel for carrying state
   * from a button press, so encode what the handler will need.
   */
  custom_id: string
}

/**
 * A button that navigates to a URL and emits no interaction.
 */
export interface APIButtonComponentWithURL extends APIButtonComponentBase<typeof ButtonStyle.Link> {
  /** The URL to open. */
  url: string
}

/**
 * A button that opens the purchase flow for a premium SKU.
 */
export interface APIButtonComponentWithSKUId extends Omit<
  APIButtonComponentBase<typeof ButtonStyle.Premium>,
  'emoji' | 'label'
> {
  /** The ID of the SKU to purchase. */
  sku_id: Snowflake
}

/**
 * Any button.
 */
export type APIButtonComponent =
  APIButtonComponentWithCustomId | APIButtonComponentWithSKUId | APIButtonComponentWithURL

/**
 * A selectable choice in a string select menu.
 */
export interface APISelectOption {
  /** The user-facing label, up to 100 characters. */
  label: string
  /** The developer-facing value sent back on selection, up to 100 characters. */
  value: string
  /** A description shown under the label, up to 100 characters. */
  description?: string
  /** An emoji shown beside the option. */
  emoji?: APIPartialEmoji
  /** Whether this option is selected by default. */
  default?: boolean
}

/**
 * A prepopulated default value in an auto-populated select menu.
 */
export interface APISelectDefaultValue {
  /** The ID of the user, role or channel. */
  id: Snowflake
  /** What `id` refers to. */
  type: 'channel' | 'role' | 'user'
}

/**
 * Fields shared by every select menu.
 */
export interface APISelectMenuBase<Type extends ComponentType> {
  /** The select menu's type. */
  type: Type
  /** An optional identifier for the component. */
  id?: number
  /** A developer-defined identifier, up to 100 characters. */
  custom_id: string
  /** Placeholder text shown when nothing is selected, up to 150 characters. */
  placeholder?: string
  /** The minimum number of items that must be chosen. Defaults to 1. */
  min_values?: number
  /** The maximum number of items that may be chosen. Defaults to 1. */
  max_values?: number
  /** Whether the menu is greyed out and non-interactive. */
  disabled?: boolean
}

/** A select menu of developer-defined choices. */
export interface APIStringSelectComponent extends APISelectMenuBase<
  typeof ComponentType.StringSelect
> {
  /** The choices, up to 25. */
  options: APISelectOption[]
}

/** A select menu prepopulated with users. */
export interface APIUserSelectComponent extends APISelectMenuBase<typeof ComponentType.UserSelect> {
  /** Users selected by default. */
  default_values?: APISelectDefaultValue[]
}

/** A select menu prepopulated with roles. */
export interface APIRoleSelectComponent extends APISelectMenuBase<typeof ComponentType.RoleSelect> {
  /** Roles selected by default. */
  default_values?: APISelectDefaultValue[]
}

/** A select menu prepopulated with users and roles. */
export interface APIMentionableSelectComponent extends APISelectMenuBase<
  typeof ComponentType.MentionableSelect
> {
  /** Users and roles selected by default. */
  default_values?: APISelectDefaultValue[]
}

/** A select menu prepopulated with channels. */
export interface APIChannelSelectComponent extends APISelectMenuBase<
  typeof ComponentType.ChannelSelect
> {
  /** Restricts the menu to these channel types. */
  channel_types?: ChannelType[]
  /** Channels selected by default. */
  default_values?: APISelectDefaultValue[]
}

/**
 * Any select menu.
 */
export type APISelectMenuComponent =
  | APIChannelSelectComponent
  | APIMentionableSelectComponent
  | APIRoleSelectComponent
  | APIStringSelectComponent
  | APIUserSelectComponent

/**
 * A text field, valid only inside a modal.
 */
export interface APITextInputComponent {
  /** Always {@link ComponentType.TextInput}. */
  type: typeof ComponentType.TextInput
  /** An optional identifier for the component. */
  id?: number
  /** A developer-defined identifier, up to 100 characters. */
  custom_id: string
  /** Whether the field is a single line or a paragraph. */
  style: TextInputStyle
  /** The label above the field, up to 45 characters. */
  label: string
  /** The minimum input length, from 0 to 4000. */
  min_length?: number
  /** The maximum input length, from 1 to 4000. */
  max_length?: number
  /** Whether the field must be filled in. Defaults to `true`. */
  required?: boolean
  /** A prefilled value, up to 4000 characters. */
  value?: string
  /** Placeholder text shown when empty, up to 100 characters. */
  placeholder?: string
}

/**
 * Any component that can sit inside a message action row.
 */
export type APIMessageActionRowComponent = APIButtonComponent | APISelectMenuComponent

/**
 * Any component that can sit inside a modal action row.
 */
export type APIModalActionRowComponent = APITextInputComponent

/**
 * A top-level component on a message.
 */
export type APIMessageComponent = APIActionRowComponent<APIMessageActionRowComponent>

/**
 * A top-level component in a modal.
 */
export type APIModalComponent = APIActionRowComponent<APIModalActionRowComponent>
