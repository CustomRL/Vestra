/**
 * Message component enumerations.
 *
 * @remarks
 * Components v2 introduced layout and content components alongside the original
 * interactive ones. A message opts into the new system with the `IsComponentsV2`
 * message flag, after which `content` and `embeds` may no longer be used.
 */

/**
 * The type of a message component.
 */
export const ComponentType = {
  /** A row containing up to five interactive components. */
  ActionRow: 1,
  /** A button. */
  Button: 2,
  /** A select menu of developer-defined choices. */
  StringSelect: 3,
  /** A text input field, valid only inside a modal. */
  TextInput: 4,
  /** A select menu prepopulated with users. */
  UserSelect: 5,
  /** A select menu prepopulated with roles. */
  RoleSelect: 6,
  /** A select menu prepopulated with users and roles. */
  MentionableSelect: 7,
  /** A select menu prepopulated with channels. */
  ChannelSelect: 8,
  /** A container for text with an optional accessory. */
  Section: 9,
  /** Markdown text. */
  TextDisplay: 10,
  /** A small image accessory for a section. */
  Thumbnail: 11,
  /** A gallery of up to ten media items. */
  MediaGallery: 12,
  /** An attached file. */
  File: 13,
  /** Vertical padding, optionally with a divider. */
  Separator: 14,
  /** A container that visually groups child components behind an accent colour. */
  Container: 17,
  /**
   * A label and optional description wrapping one interactive component.
   *
   * @remarks
   * The modal building block. Every interactive component in a modal sits inside one of
   * these, which is why a submitted modal's components are labels rather than the action
   * rows older modals used.
   */
  Label: 18,
  /** A file upload field, valid inside a modal label. */
  FileUpload: 19,
  /** A set of options where exactly one may be chosen. */
  RadioGroup: 21,
  /** A set of checkboxes where any number may be chosen. */
  CheckboxGroup: 22,
  /** A single yes-or-no checkbox. */
  Checkbox: 23,
} as const

/**
 * A component type.
 */
export type ComponentType = (typeof ComponentType)[keyof typeof ComponentType]

/**
 * The visual style of a button.
 */
export const ButtonStyle = {
  /** Blurple. Requires `custom_id`. */
  Primary: 1,
  /** Grey. Requires `custom_id`. */
  Secondary: 2,
  /** Green. Requires `custom_id`. */
  Success: 3,
  /** Red. Requires `custom_id`. */
  Danger: 4,
  /** Grey, navigates to a URL. Requires `url` and produces no interaction. */
  Link: 5,
  /** Blurple, for purchasing a premium SKU. Requires `sku_id`. */
  Premium: 6,
} as const

/**
 * A button style.
 */
export type ButtonStyle = (typeof ButtonStyle)[keyof typeof ButtonStyle]

/**
 * The size of a text input in a modal.
 */
export const TextInputStyle = {
  /** A single line. */
  Short: 1,
  /** A multi-line paragraph. */
  Paragraph: 2,
} as const

/**
 * A text input style.
 */
export type TextInputStyle = (typeof TextInputStyle)[keyof typeof TextInputStyle]

/**
 * The amount of vertical padding a separator adds.
 */
export const SeparatorSpacingSize = {
  /** Small padding. */
  Small: 1,
  /** Large padding. */
  Large: 2,
} as const

/**
 * A separator spacing size.
 */
export type SeparatorSpacingSize = (typeof SeparatorSpacingSize)[keyof typeof SeparatorSpacingSize]
