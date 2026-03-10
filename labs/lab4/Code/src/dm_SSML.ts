import { assign, createActor, setup } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY } from "./azure";
import type { DMContext, DMEvents } from "./types";

import * as sdk from "microsoft-cognitiveservices-speech-sdk";

const speechConfig = sdk.SpeechConfig.fromSubscription(KEY, "swedencentral");

export function speakSSML(ssml: string) {
  const synthesizer = new sdk.SpeechSynthesizer(speechConfig);
  synthesizer.speakSsmlAsync(
    ssml,
    (result) => {
      if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
        console.log("SSML successful.");
      } else {
        console.error("SSML failed. Error is:", result.errorDetails);
      }
      synthesizer.close();
    }
  );
}

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
}

const grammar: { [index: string]: GrammarEntry } = {
  vlad: { person: "Vladislav Maraev" },
  bora: { person: "Bora Kara" },
  tal: { person: "Talha Bedir" },
  tom: { person: "Tom Södahl Bladsjö" },
  monday: { day: "Monday" },
  tuesday: { day: "Tuesday" },
  "10": { time: "10:00" },
  "11": { time: "11:00" },
};

function isInGrammar(utterance: string) {
  return utterance.toLowerCase() in grammar;
}

function getPerson(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).person;
}

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

    "azure.speakSSML": ({ self }, params: { ssml: string }) => {
      const synthesizer = new sdk.SpeechSynthesizer(speechConfig);
      synthesizer.speakSsmlAsync(
        params.ssml,
        (result) => {
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            console.log("SSML successful.");
            self.send({ type: "SPEAK_COMPLETE" }); // We need to send SPEAK_COMPLETE event for speechstate
          } else {
            console.error("SSML failed. Error is:", result.errorDetails);
          }
          synthesizer.close();
        },
  );
},
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
            target: "straightSSML",
            guard: ({ context }) => !!context.lastResult,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `Hello world!` } },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `I can't hear you!` },
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
    straightSSML: {
      entry: { 
              type: "azure.speakSSML", 
              params: { ssml: `<!--ID=B7267351-473F-409D-9765-754A8EBCDE05;Version=1|{"VoiceNameToIdMapItems":[{"Id":"4b1dc409-f234-45cf-bda5-852fa95d0e5f","Name":"Microsoft Server Speech Text to Speech Voice (en-GB, SoniaNeural)","ShortName":"en-GB-SoniaNeural","Locale":"en-GB","VoiceType":"StandardVoice"}]}-->
<!--ID=FCB40C2B-1F9F-4C26-B1A1-CF8E67BE07D1;Version=1|{"Files":{}}-->
<!--ID=5B95B1CC-2C7B-494F-B746-CF22A0E779B7;Version=1|{"Locales":{"en-GB":{"AutoApplyCustomLexiconFiles":[{}]}}}-->
<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xmlns:emo="http://www.w3.org/2009/10/emotionml" version="1.0" xml:lang="en-GB"><mstts:backgroundaudio src="https://raw.githubusercontent.com/Bora-Valar-Kara/dialogue-systems-1-2025/refs/heads/main/radio_test.mp3" volume="2.0" /><voice name="en-GB-SoniaNeural">Hello, I will now employ background audio.</voice></speak>` } 
            },
      on: { SPEAK_COMPLETE: "withContextSSML" },
    },
    withContextSSML: {
      entry: {
            type: "azure.speakSSML",
            params: ({ context }) => ({ ssml: `<!--ID=B7267351-473F-409D-9765-754A8EBCDE05;Version=1|{"VoiceNameToIdMapItems":[{"Id":"b5f86142-ce84-4483-8142-45db0d778add","Name":"Microsoft Server Speech Text to Speech Voice (en-US, DavisNeural)","ShortName":"en-US-DavisNeural","Locale":"en-US","VoiceType":"StandardVoice"}]}-->
<!--ID=FCB40C2B-1F9F-4C26-B1A1-CF8E67BE07D1;Version=1|{"Files":{}}-->
<!--ID=5B95B1CC-2C7B-494F-B746-CF22A0E779B7;Version=1|{"Locales":{"en-US":{"AutoApplyCustomLexiconFiles":[{}]}}}-->
<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xmlns:emo="http://www.w3.org/2009/10/emotionml" version="1.0" xml:lang="en-US"><voice name="en-US-DavisNeural"><s /><mstts:express-as style="whispering">As the door beeps open, I enter the house. There is no voice besides my steps... Then someone loudly yelled ${context.lastResult?.[0]?.confidence}! My name! And I turned my back.</mstts:express-as><s /></voice></speak>`,
            }),
      on: {
        on: { SPEAK_COMPLETE: "Done" },
      },
    },
  },
    Done: {
      on: {
        CLICK: "Greeting",
      },
  },
}});

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

