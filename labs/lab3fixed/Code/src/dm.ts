import { assign, createActor, setup } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY } from "./azure";
import type { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint:
    "https://swedencentral.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const settings: Settings = {
  azureCredentials: azureCredentials,
  azureRegion: "swedencentral",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

interface GrammarEntry {
  person?: string;
  day?: string;
  time?: string;
};

const grammar: { [index: string]: GrammarEntry } = {
  vlad: { person: "Vladislav Maraev" },
  bora: { person: "Bora Kara" },
  tal: { person: "Talha Bedir" },
  tom: { person: "Tom Södahl Bladsjö" },
  elisa: { person: "Elisa Beihofer" },
  dimitri: { person: "Dimitrios Moussaka Goutas" },
  jonathan: { person: "Jonathan Nygren" },
  monday: { day: "Monday" },
  tuesday: { day: "Tuesday" },
  wednesday: {day: "Wednesday"},
  thursday: {day: "Thursday"},
  friday: {day: "Friday"},
  "8": { time: "08:00" },
  "9": { time: "09:00" },
  "10": { time: "10:00" },
  "11": { time: "11:00" },
  "12": { time: "12:00" },
  "13": { time: "13:00" },
  "14": { time: "14:00" },
  "15": { time: "15:00" },
  "16": { time: "16:00" },
  "17": { time: "17:00" },
  "18": { time: "18:00" },
  "19": { time: "19:00" },
};

// grammar to understand answers
interface AnswerEntry {
  answer?: "yes" | "no"; //the possibilites all boil down to yes or no
};

const answerGrammar: { [index: string]: AnswerEntry } = {
  yes: {answer: "yes"},
  yeah: {answer: "yes"},
  "of course": {answer: "yes"},
  no: {answer: "no"},
  nope: {answer: "no"},
  "no way": {answer: "no"},
};

function isInGrammar(utterance: string) {
  return utterance.toLowerCase() in grammar;
};

// function to check what answer was given
function getAnswer(utterance: string) {
  return (answerGrammar[utterance.toLowerCase()] || {}).answer;
};

function getPerson(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).person;
};

const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
  },
  actions: {
    "spst.speak": ({ context }, params: { utterance: string }) =>
      context.spstRef.send({
        type: "SPEAK",
        value: {
          utterance: params.utterance,
        },
      }),
    "spst.listen": ({ context }) =>
      context.spstRef.send({
        type: "LISTEN",
      }),
  },
}).createMachine({
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
  }),
  id: "DM",
  initial: "Prepare",
  states: {
    Prepare: {
      entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "WaitToStart" },
    },
    WaitToStart: {
      on: { CLICK: "Greeting" },
    },
    Greeting: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "CheckAnswer",
            guard: ({ context }) => !!context.lastResult,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `Hello! Are you ready to create an appointment?` } },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `I can't hear you! Please answer yes or no.` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        // state for invalid answers
        InvalidAnswer: {
          entry: {
            type: "spst.speak",
            params: { utterance: "Your answer was not valid. Please try again." },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => {
                return { lastResult: event.value };
              }),
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
        },
      },
    },
    // Checking answer to greeting (does user want to proceed?)
    CheckAnswer: {
      entry: assign(({ context }) => {
        const utterance = context.lastResult![0].utterance;
        const answer = getAnswer(utterance);

        return {
          ready: answer, 
        };
      }),
      always: [
        // needs to point either to Done ("no") or Person ("yes")
        {
          target: "Person",
          guard: ({ context }) => context.ready === "yes",
        },
        {
          target: "Repeat",
          guard: ({ context }) => context.ready === "no",
        },
        {
          // asking again if the answer was not valid
          target: "Greeting.InvalidAnswer",
        },
      ],
    },
      
// insert other states here

    // Who are you meeting with?
     Person: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "CheckPerson",
            guard: ({ context }) => !!context.lastResult,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `Who are you meeting with?` } },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `I can't hear you, please tell me the person you're meeting with.` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        // state for invalid answers
        InvalidAnswer: {
          entry: {
            type: "spst.speak",
            params: { utterance: "That person is not on my list. Please try again." },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => {
                return { lastResult: event.value };
              }),
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
        },
      },
    },
    CheckPerson: {
      entry: assign(({ context }) => {
        const utterance = context.lastResult![0].utterance;
        const answer = getPerson(utterance);

        return {
          person: answer, 
        };
      }),
      always: [
        // needs to point to Day
        {
          target: "Day",
          guard: ({ context }) => !!context.person,
        },
        {
          // if invalid ask again
          target: "Person.InvalidAnswer",
        },
      ],
    },

    // On which day is your meeting?
     Day: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "CheckDay",
            guard: ({ context }) => !!context.lastResult,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `On which day is your meeting?` } },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `I can't hear you, please tell me the day you're meeting on.` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        // state for invalid answers
        InvalidAnswer: {
          entry: {
            type: "spst.speak",
            params: { utterance: "That day is not possible. Please try again." },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => {
                return { lastResult: event.value };
              }),
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
        },
      },
    },
    CheckDay: {
      entry: assign(({ context }) => {
        const utterance = context.lastResult![0].utterance;
        const entry = grammar[utterance.toLowerCase()] || {};

        return {
          day: entry.day, 
        };
      }),
      always: [
        {
          target: "wholeDay",
          guard: ({ context }) => !!context.day,
        },
        {
          target: "Day.InvalidAnswer",
        },
      ],
    },

    // Will it take the whole day?
     wholeDay: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "CheckWholeDay",
            guard: ({ context }) => !!context.lastResult,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `Will it take the whole day?` } },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `I can't hear you. Please answer yes or no.` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        // state for invalid answers
        InvalidAnswer: {
          entry: {
            type: "spst.speak",
            params: { utterance: "Your answer was not valid. Please try again." },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => {
                return { lastResult: event.value };
              }),
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
        },
      },
    },
    CheckWholeDay: {
      entry: assign(({ context }) => {
        const utterance = context.lastResult![0].utterance;
        const answer = getAnswer(utterance);

        return {
          wholeDay: answer === "yes" ? true : answer === "no" ? false: undefined, 
        };
      }),
      always: [
        // needs to point either to Time ("no") or Confirm ("yes")
        {
          target: "Confirm",
          guard: ({ context }) => context.wholeDay === true,
        },
        {
          target: "Time",
          guard: ({ context }) => context.wholeDay === false,
        },
        {
          // asking again if the answer was not valid
          target: "wholeDay.InvalidAnswer", 
        },
      ],
    },

    // What time is your meeting?
     Time: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "CheckTime",
            guard: ({ context }) => !!context.lastResult,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `What time is your meeting?` } },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `I can't hear you, please tell me the time you're meeting at.` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        // state for invalid answers
        InvalidAnswer: {
          entry: {
            type: "spst.speak",
            params: { utterance: "That time is not possible. Please try again." },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => {
                return { lastResult: event.value };
              }),
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
        },
      },
    },
    CheckTime: {
      entry: assign(({ context }) => {
        const utterance = context.lastResult![0].utterance;
        const entry = grammar[utterance.toLowerCase()] || {};

        return {
          time: entry.time, 
        };
      }),
      always: [
        {
          target: "Confirm",
          guard: ({ context }) => !!context.time,
        },
        {
          target: "Time.InvalidAnswer",
        },
      ],
    },

    // General confirm state
    Confirm: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "CheckConfirm",
            guard: ({ context }) => !!context.lastResult,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: { 
            type: "spst.speak", 
            params: ({ context }) => ({
              utterance: context.wholeDay
              ? `Do you want me to create an appointment with ${context.person} on ${context.day} for the whole day?`
              : `Do you want me to create an appointment with ${context.person} on ${context.day} at ${context.time}?`,
            }),
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },

        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign({
                lastResult: ({ event }) => event.value,
              }),
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
        },
        NoInput: {
          entry: { 
            type: "spst.speak",
            params: { utterance: "I didn't hear you. Please answer yes or no."},
          },
          on: { SPEAK_COMPLETE: "Ask"},
        },
        // state for invalid answers
        InvalidAnswer: {
          entry: {
            type: "spst.speak",
            params: { utterance: "Your answer was not valid. Please try again." },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
      },
    },
    CheckConfirm: {
      entry: assign(({ context }) => {
        const utterance = context.lastResult![0].utterance;
        const answer = getAnswer(utterance);

        return {
          confirmation: answer === "yes" ? true : answer === "no" ? false: undefined, 
        };
      }),
      always: [
        // needs to point either to Greeting ("no") or Done ("yes")
        {
          target: "Done",
          guard: ({ context }) => context.confirmation === true,
        },
        {
          target: "Repeat",
          guard: ({ context }) => context.confirmation === false,
        },
        {
          // asking again if the answer was not valid
          target: "Confirm.InvalidAnswer", 
        },
      ],
    },

    // state in case the user aborts the process
    Repeat: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Exiting. Have a nice day and click to try again!" },
      },
      on: {
        CLICK: "Greeting",
      },
    },

    Done: {
      entry: { 
        type: "spst.speak",
        params: { utterance: "Your appointment has been created." },
      },
      on: {
        CLICK: "Greeting",
      },
    },
  },
});

const dmActor = createActor(dmMachine, {
  inspect: inspector.inspect,
}).start();

dmActor.subscribe((state) => {
  console.group("State update");
  console.log("State value:", state.value);
  console.log("State context:", state.context);
  console.groupEnd();
});

export function setupButton(element: HTMLButtonElement) {
  element.addEventListener("click", () => {
    dmActor.send({ type: "CLICK" });
  });
  dmActor.subscribe((snapshot) => {
    const meta: { view?: string } = Object.values(
      snapshot.context.spstRef.getSnapshot().getMeta(),
    )[0] || {
      view: undefined,
    };
    element.innerHTML = `${meta.view}`;
  });
}
