import { FunctionCallDefinition } from "./gemini-api.js";

/**
 * Show Alert Box Tool
 * Displays a browser alert dialog with a custom message
 */
export class ShowAlertTool extends FunctionCallDefinition {
  constructor() {
    super(
      "show_alert",
      "Displays an alert dialog box with a message to the user",
      {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "The message to display in the alert box",
          },
          title: {
            type: "string",
            description: "Optional title prefix for the alert message",
          },
        },
      },
      ["message"]
    );
  }

  functionToCall(parameters) {
    const message = parameters.message || "Alert!";
    const title = parameters.title;

    // Construct the full alert message
    const fullMessage = title ? `${title}: ${message}` : message;

    // Show the alert
    alert(fullMessage);

    // alert shown
  }
}

/**
 * Add CSS Style Tool
 * Injects CSS styles into the current page with !important flag
 */
export class AddCSSStyleTool extends FunctionCallDefinition {
  constructor() {
    super(
      "add_css_style",
      "Injects CSS styles into the current page with !important flag",
      {
        type: "object",
        properties: {
          selector: {
            type: "string",
            description:
              "CSS selector to target elements (e.g., 'body', '.class', '#id')",
          },
          property: {
            type: "string",
            description:
              "CSS property to set (e.g., 'background-color', 'font-size', 'display')",
          },
          value: {
            type: "string",
            description:
              "Value for the CSS property (e.g., 'red', '20px', 'none')",
          },
          styleId: {
            type: "string",
            description:
              "Optional ID for the style element (for updating existing styles)",
          },
        },
      },
      ["selector", "property", "value"]
    );
  }

  functionToCall(parameters) {
    const { selector, property, value, styleId } = parameters;

    // Create or find the style element
    let styleElement;
    if (styleId) {
      styleElement = document.getElementById(styleId);
      if (!styleElement) {
        styleElement = document.createElement("style");
        styleElement.id = styleId;
        document.head.appendChild(styleElement);
      }
    } else {
      styleElement = document.createElement("style");
      document.head.appendChild(styleElement);
    }

    // Create the CSS rule with !important
    const cssRule = `${selector} { ${property}: ${value} !important; }`;

    // Add the CSS rule to the style element
    if (styleId) {
      // If using an ID, replace the content
      styleElement.textContent = cssRule;
    } else {
      // Otherwise append to any existing content
      styleElement.textContent += cssRule;
    }

    // CSS style injected
  }
}

/** CompleteQuestTool — Learny calls when the visible quest goal is met. */
export class CompleteQuestTool {
  constructor(onComplete) {
    this.name = "complete_quest";
    this.description =
      "Call ONLY when ALL steps of the current Minecraft quest are complete AND the child spoke each step's English phrase in this call. " +
      "Never call on hostile, upset, or off-topic speech (e.g. 'I hate you'). " +
      "user_quote must be the exact latest transcript — never invent or translate English.";
    this.parameters = {
      type: "object",
      properties: {
        user_quote: {
          type: "string",
          description:
            "Exact latest user speech transcript (must contain English for the final step — do not translate or invent)",
        },
        reason: {
          type: "string",
          description: "Brief note on why all quest steps succeeded",
        },
      },
    };
    this.requiredParameters = ["user_quote"];
    this.onComplete = onComplete;
  }

  getDefinition() {
    return {
      name: this.name,
      description: this.description,
      parameters: { required: this.requiredParameters, ...this.parameters },
    };
  }

  runFunction(parameters) {
    if (this.onComplete) {
      this.onComplete(parameters?.reason || "quest_complete");
    }
  }

  functionToCall(parameters) {
    this.runFunction(parameters);
  }
}
