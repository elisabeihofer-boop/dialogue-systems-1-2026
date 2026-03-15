import { assign, createActor, setup } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY, NLU_KEY } from "./azure";
import type { DMContext, NLUObject, DMEvents, Entity } from "./types"; // added NLUObject and Entity

const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint:
    "https://swedencentral.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const azureLanguageCredentials = {
  endpoint: "https://lab-gusbeihel.cognitiveservices.azure.com/language/:analyze-conversations?api-version=2024-11-15-preview" /** your Azure CLU prediction URL */,
  key: NLU_KEY /** reference to your Azure CLU key */,
  deploymentName: "appointment" /** your Azure CLU deployment */,
  projectName: "lab-5" /** your Azure CLU project name */,
  };

const settings: Settings = {
  azureLanguageCredentials: azureLanguageCredentials, //** global act
  azureCredentials: azureCredentials,
  azureRegion: "swedencentral",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

// helper function to get the entity
function getEntity(nlu: NLUObject | null, category: string): string | undefined {
  return nlu?.entities.find((e) => e.category === category)?.text;
};

// helper function to get yes / no answers
function getYesNo(nlu: NLUObject | null): boolean | undefined {
  const entity = nlu?.entities?.find(e => e.category === "YesNo");
  if (!entity) return undefined;

  const value = entity.text.toLowerCase();

  if (value.includes("yes")) return true;
  if (value.includes("no")) return false;

  return undefined;
};

// checking the confidence score for the intents
function getIntentConfidence(nlu: NLUObject | null, intent: string): number {
  return nlu?.intents.find(i => i.category === intent)?.confidenceScore ?? 0;
};

const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
  },
  actions: {
    "spst.speak": ({ context }, params: { utterance: string }) => {
      context.spstRef.send({
        type: "SPEAK",
        value: { utterance: params.utterance },
      });
    },
    "spst.listen": ({ context }) =>
      context.spstRef.send({
        type: "LISTEN",
      }),
    // Adding the NLU activation to "LISTEN"
    "spst.listenNLU": ({ context }) => {
      context.spstRef.send({
        type: "LISTEN",
        value: { nlu: true }, /** Local activation of NLU */
      });
    },
  },
}).createMachine({
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),

    // Adding interpretation
    interpretation: null,

    person: undefined,
    day: undefined,
    time: undefined,
    wholeDay: undefined,
    confirmation: undefined,

  }),
  id: "DM",
  initial: "Prepare",

  states: {
    Prepare: {
      entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "WaitToStart" },
    },
    WaitToStart: {
      on: { CLICK: "Decision" },
    },

// Initial decision (which Intent?)
    Decision: {
      //small greeting to let the user know the system is ready to start
      initial: "Speak",
      states: {
         Speak: {
          entry: {
            type: "spst.speak",
            params: { utterance: "Hi! How can I help you?" }
          },
          on: { SPEAK_COMPLETE: "Listen" },
        },
        Listen: {
          entry: { type: "spst.listenNLU" },
          on: {
            RECOGNISED: {
              actions: assign({
                interpretation: ({ event }) => event.nluValue ?? null,
                person: ({ event }) => getEntity(event.nluValue, "Person"),
                day: ({ event }) => getEntity(event.nluValue, "Day"),
                time: ({ event }) => getEntity(event.nluValue, "Time"),
                wholeDay: ({ event }) =>
                  event.nluValue?.entities.find(
                    (e: Entity) => e.category === "wholeDay"
                  )?.text,
              }),
            },

            LISTEN_COMPLETE: [
              {
                guard: ({ context }) =>
                  context.interpretation?.topIntent === "WhoIs" &&
                //checking for confidence (should be over 60%)
                  getIntentConfidence(context.interpretation, "WhoIs") > 0.6,
                target: "#DM.WhoIsPath",
              },

              {
                guard: ({ context }) =>
                  context.interpretation?.topIntent === "CreateMeeting" &&
                  getIntentConfidence(context.interpretation, "CreateMeeting") > 0.6,
                target: "#DM.CreateMeetingPath",
              },

              {
                target: "InvalidAnswer",
              },
            ],
          },
        },
        // state for invalid answers
        InvalidAnswer: {
          entry: {
            type: "spst.speak",
            params: { utterance: "I didn't understand. You can either ask about a famous person or create an appointment. Please try again." },
          },
          on: { SPEAK_COMPLETE: "Listen" },
        },
      },
    },

// If the system recognizes WhoIs
    WhoIsPath: {
      initial: "CheckPerson",
      states: {

        //checking if person was recognized
        CheckPerson: {
          always: [
            {
              guard: ({ context }) => context.person !== undefined,
              target: "Answer"
            },
            {
              target: "AskPersonAgain"
            }
          ]
        },

        //asking again if person was not recognized
        AskPersonAgain: {
          entry: {
            type: "spst.speak",
            params: {
              utterance: "I did not catch that name. Please tell me who you would like to know about."
            }
          },
          on: { SPEAK_COMPLETE: "ListenPerson"}
        },

        //listening for person
        ListenPerson: {
          entry: { type: "spst.listenNLU" },
          on: {
            RECOGNISED: {
              actions: assign({
                person: ({ event }) => getEntity(event.nluValue, "Person")
              })
            },
            LISTEN_COMPLETE: "CheckPerson"
          }
        },

        Answer: {
          entry: {
            type: "spst.speak",
            params: ({ context }) => ({
              utterance: `${context.person} is a well-known public figure. But YOU are the real star!`
            })
          },
          on: {
            SPEAK_COMPLETE: "#DM.WaitToStart",
          },
        },
      },
    },

// If the system recognizes CreateMeeting
    CreateMeetingPath: {
      initial: "CheckEntities",
      states: {

        CheckEntities: {

          // printing to the console to check what the system recognizes
          entry: ({ context }) => {
            console.log("person:", context.person);
            console.log("day:", context.day);
            console.log("time:", context.time);
            console.log("wholeDay:", context.wholeDay);
          },
          always: [
            { guard: ({ context }) => !context.person, target: "AskPerson" },
            { guard: ({ context }) => !context.day, target: "AskDay" },
            { guard: ({ context }) => context.wholeDay === undefined && !context.time, target: "AskWholeDay" },
            { guard: ({ context }) => context.wholeDay === false && !context.time, target: "AskTime" },
            { target: "Confirm" },
          ]
        },

        AskPerson: { 
          entry: {
            type: "spst.speak",
            params: { utterance: "Who are you meeting with?" }
          },
          on: { SPEAK_COMPLETE: "ListenPerson" }
        },

        ListenPerson: {
          entry: {
            type: "spst.listenNLU"
          },
          on: {
            RECOGNISED: {
              actions: assign({
                interpretation: ({event}) => event.nluValue ?? null,
                person: ({event}) => getEntity(event.nluValue, "Person")
              })
            },
            LISTEN_COMPLETE: "CheckEntities"
          }
        },

        AskDay: { 
          entry: {
            type: "spst.speak",
            params: { utterance: "On which day is your meeting?" }
          },
          on: { SPEAK_COMPLETE: "ListenDay" }
        },

        ListenDay: {
          entry: {
            type: "spst.listenNLU"
          },
          on: {
            RECOGNISED: {
              actions: assign({
                day: ({event}) => getEntity(event.nluValue, "Day")
              })
            },
            LISTEN_COMPLETE: "CheckEntities"
          }
        },

        AskWholeDay: { 
          entry: {
            type: "spst.speak",
            params: { utterance: "Will it take the whole day?" }
          },
          on: { SPEAK_COMPLETE: "ListenWholeDay" }
        },

        ListenWholeDay: {
          entry: {
            type: "spst.listenNLU"
          },
          on: {
            RECOGNISED: {
              actions: assign({
                interpretation: ({event}) => event.nluValue ?? null,
                wholeDay: ({event}) => getYesNo(event.nluValue)
              })
            },
            LISTEN_COMPLETE: "CheckEntities"
          }
        },

        AskTime: { // Azure thinks that days are also a time, retraining didn't fix that :/
          entry: {
            type: "spst.speak",
            params: { utterance: "What time is your meeting?" }
          },
          on: { SPEAK_COMPLETE: "ListenTime" }
        },

        ListenTime: {
          entry: {
            type: "spst.listenNLU"
          },
          on: {
            RECOGNISED: {
              actions: assign({
                time: ({event}) => getEntity(event.nluValue, "Time")
              })
            },
            LISTEN_COMPLETE: "CheckEntities"
          }
        },

        Confirm: { 
          entry: {
            type: "spst.speak",
            params: ({context}) => ({
              utterance: context.wholeDay
              ? `Should I create a meeting with ${context.person} on ${context.day} for the whole day?`
              : `Should I create a meeting with ${context.person} on ${context.day} at ${context.time}?`
            })
          },
          on: { SPEAK_COMPLETE: "ListenConfirm" }
        },

        ListenConfirm: {
          entry: {
            type: "spst.listenNLU"
          },
          on: {
            RECOGNISED: {
              actions: assign({
                confirmation: ({event}) => getYesNo(event.nluValue)
              })
            },
            LISTEN_COMPLETE: [
              {
                guard: ({context}) => context.confirmation === true,
                target: "#DM.Done"
              },
              {
                guard: ({context}) => context.confirmation === false,
                target: "#DM.Repeat"
              },
              {target: "Confirm"}
            ]
          },
        },

      },
    },

    // state in case the user aborts the process
    Repeat: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Exiting. Have a nice day and click to try again!" },
      },
      on: {
        CLICK: "Decision",
      },
    },

    Done: {
      entry: { 
        type: "spst.speak",
        params: { utterance: "Your appointment has been created." },
      },
      on: {
        CLICK: "Decision",
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
