import type { SpeechStateExternalEvent } from "speechstate";
import type { ActorRef } from "xstate";

export interface DMContext {
  spstRef: ActorRef<any, any>;

  person?: string;
  day?: string;
  wholeDay?: boolean;
  time?: string;
  confirmation?: boolean;

  // adding the NLUObject to the DMContext type
  interpretation: NLUObject | null;
}


// Adding the Entitiy object type
export interface Entity { // This is the type of the entities array in the NLUObject. 
  category: string;
  text: string;
  confidenceScore: number;
  offset: number;
  length: number;
}

// Adding the Intent object type
export interface Intent { // This is the type of the intents array in the NLUObject.
  category: string;
  confidenceScore: number;
}

// Adding the NLUObject (contains Intent and Entity)
export interface NLUObject { // This is the type of the interpretation in the DMContext.
  entities: Entity[];
  intents: Intent[];
  projectKind: string;
  topIntent: string;
}

export type DMEvents = SpeechStateExternalEvent | { type: "CLICK" } | { type: "DONE" };
