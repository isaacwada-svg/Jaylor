/** Thin wrapper around the browser's (non-standard) SpeechRecognition API. */

interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike {
  error?: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

type RecognitionHandle = {
  start: () => void;
  stop: () => void;
};

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w["SpeechRecognition"] || w["webkitSpeechRecognition"]);
}

export function startSpeechRecognition(handlers: {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onEnd: () => void;
  onError: (message: string) => void;
}): RecognitionHandle | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"]) as
    (new () => SpeechRecognitionInstance) | undefined;
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = "en-NG";
  recognition.interimResults = true;
  recognition.continuous = true;

  let finalText = "";

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result?.[0]?.transcript ?? "";
      if (result?.isFinal) {
        finalText += transcript + " ";
        handlers.onFinal(finalText.trim());
      } else {
        interim += transcript;
      }
    }
    if (interim) handlers.onInterim((finalText + interim).trim());
  };
  recognition.onerror = (event) => {
    handlers.onError(event?.error ?? "Voice input failed");
  };
  recognition.onend = () => handlers.onEnd();

  recognition.start();
  return {
    start: () => recognition.start(),
    stop: () => recognition.stop(),
  };
}
