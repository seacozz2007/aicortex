# Interactive Question Forms

## When to use this skill

**When you need to ask the user more than one question, you MUST use a `<question-form>` block.** Never ask questions one at a time in prose — batch them into a single interactive form. The frontend renders these as tappable forms so users can answer by clicking instead of typing.

Use this skill for any multi-question scenario:
- Gathering personal info (name, preferences, background)
- Collecting project requirements (platform, audience, features)
- Design preferences (style, colors, mood)
- Feedback collection (ratings, comments, suggestions)
- Configuration setup (settings, options, parameters)
- Any situation where the user needs to provide multiple pieces of information

## Format

```html
<question-form id="unique-id" title="What you're asking about">
{
  "questions": [
    // ... question objects ...
  ]
}
</question-form>
```

The `id` and `title` can be set as attributes on the opening tag OR as keys in the JSON body. `title` is shown to the user as the form heading. `description` (optional, in JSON body) appears as a subtitle.

Use `id` values that are short, descriptive, and unique within the form (e.g. "name", "platform", "audience").

## Supported question types

### radio — single choice
```json
{"id": "platform", "label": "What platform?", "type": "radio",
 "options": ["Mobile (iOS/Android)", "Desktop web", "Responsive"],
 "required": true}
```
Aliases: `single`, `choice`. Renders as chip-style selectable buttons. Exactly one can be picked.

### checkbox — multiple choice
```json
{"id": "features", "label": "Must-have features?", "type": "checkbox",
 "options": ["Authentication", "Payments", "Search", "Notifications"],
 "maxSelections": 3}
```
Aliases: `multi`, `multiple`. Renders as chip-style toggle buttons. Use `maxSelections` to cap how many the user can pick.

### select — dropdown menu
```json
{"id": "style", "label": "Visual style?", "type": "select",
 "options": ["Minimal", "Bold", "Classic", "Playful"]}
```
Alias: `dropdown`. Renders as a native dropdown. Good for lists of 5+ options.

### text — single line input
```json
{"id": "name", "label": "Your name?", "type": "text",
 "placeholder": "e.g. Zhang San"}
```
Renders as a single-line text input.

### textarea — multi-line input
```json
{"id": "requirements", "label": "Additional requirements?", "type": "textarea",
 "placeholder": "Describe any specific needs..."}
```
Aliases: `long`, `paragraph`. Renders as a resizable multi-line text area.

## Option formats

Options can be simple strings or objects:

```json
// Simple strings
"options": ["Mobile", "Desktop", "Responsive"]

// Objects with descriptions
"options": [
  {"label": "Mobile", "value": "mobile", "description": "iOS and Android apps"},
  {"label": "Desktop", "value": "desktop", "description": "Web browser on desktop"}
]
```

When using objects:
- `label` — shown to the user (required)
- `value` — sent back in the answer (defaults to label if omitted)
- `description` — shown as a subtitle below the label (optional)

## Other field properties

- `required: true` — user must answer before submitting
- `placeholder: "..."` — shown when the field is empty (text/textarea only)
- `help: "..."` — hint text shown below the label
- `defaultValue: "..."` — pre-filled value (also accepts `default` as alias)

## How answers come back

When the user submits the form, you'll receive a message like:

```
[form answers — discovery]
- Platform: Mobile (iOS/Android)
- Name: Zhang San
- Features: Auth, Payments
```

Read this message to understand the user's answers, then continue the conversation.

## Examples

### Example 1: Gathering user info
```html
<question-form id="user-info" title="Tell me about yourself">
{
  "questions": [
    {"id": "name", "label": "Your name", "type": "text", "required": true},
    {"id": "gender", "label": "Gender", "type": "radio",
     "options": ["Male", "Female", "Other"], "required": true},
    {"id": "goal", "label": "What do you want to build?", "type": "textarea",
     "placeholder": "Describe your goal or project..."}
  ]
}
</question-form>
```

### Example 2: Project requirements
```html
<question-form id="project-brief" title="Project requirements">
{
  "description": "Help me understand what you need so I can build it right.",
  "questions": [
    {"id": "type", "label": "Project type", "type": "radio",
     "options": ["Landing page", "Web app", "Mobile app", "API", "Other"],
     "required": true},
    {"id": "platform", "label": "Target platform", "type": "checkbox",
     "options": ["Web", "iOS", "Android", "Desktop"], "maxSelections": 3},
    {"id": "deadline", "label": "When do you need this?", "type": "text",
     "placeholder": "e.g. Next week, End of month"},
    {"id": "budget", "label": "Budget or constraints?", "type": "select",
     "options": ["No limit", "Under $100", "$100-$500", "$500+", "Just exploring"]},
    {"id": "details", "label": "Any other details?", "type": "textarea",
     "placeholder": "Links, references, specific requirements..."}
  ]
}
</question-form>
```

### Example 3: Simple survey
```html
<question-form id="feedback">
{
  "title": "Quick feedback",
  "questions": [
    {"id": "satisfaction", "label": "How satisfied are you?", "type": "radio",
     "options": ["Very satisfied", "Satisfied", "Neutral", "Unsatisfied"],
     "required": true},
    {"id": "comments", "label": "Any comments?", "type": "textarea"}
  ]
}
</question-form>
```
