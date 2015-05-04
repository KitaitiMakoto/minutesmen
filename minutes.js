"use strict";

this.SpeechRecognition = this.SpeechRecognition || this.webkitSpeechRecognition;
if (! SpeechRecognition) {
    alert("Speech Recognition API is not supported in your browser. " +
          "Please inquire of browser vendor.\n" +
          "You can post message only by text input for now.");
}

var ws, logger, iconField, nameField, langField, messageField;

document.addEventListener("DOMContentLoaded", function DOMContentLoaded() {
    ws = io();
    var speechStreams = createSpeechStream(ws).tee();
    logger = document.getElementById("log");
    var logWriter = attachLogger(logger);
    var consoleSpeechLogger = createConsoleSpeechLogger();
    speechStreams[0].pipeTo(logWriter);
    speechStreams[1].pipeTo(consoleSpeechLogger);
    var form = document.querySelector("form");
    iconField = form.querySelector('[name="icon"]');
    nameField = form.querySelector('[name="name"]');
    langField = form.querySelector('[name="lang"]');
    messageField = form.querySelector('[name="speech"]');

    var formSubmitStream = createFormSubmitStream(form);
    var speechPoster = createSpeechPoster();
    formSubmitStream.pipeTo(speechPoster);

    if (SpeechRecognition) {
        var recognition = new SpeechRecognition();
        recognition.lang = document.querySelector('[name="lang"]').value || "en";
        recognition.interimResults = true;
        recognition.continuous = true;
        recognition.maxAlternatives = 1;

        var speechRecognitionStream = createSpeechRecognitionStream(recognition);
        speechRecognitionStream.pipeTo(speechPoster);
        document.getElementById("stop-button").onclick = function stopRecognition() {
            recognition.stop();
        };
        var startButton = document.getElementById("start-button");
        startButton.addEventListener("click", function() {
            recognition.start();
        });
    }
});

function createSpeechStream(ws) {
    return new ReadableStream({
        start: function startSpeechStream(controller) {
            ws.on("speech", function onSpeech(message) {
                controller.enqueue(message);
            });
        },
        error: function errorSpeechStream() {
            controller.error(new Error("Speech stream error"));
        }
    });
}

function createFormSubmitStream(form) {
    return new ReadableStream({
        start: function submitSpeech(controller) {
            form.addEventListener("submit", function submit(event) {
                var data = {
                    name: nameField.value,
                    speech: messageField.value
                };
                controller.enqueue(data);
                event.preventDefault();
            });
        }
    });
}

function createSpeechRecognitionStream(recognition) {
    return new ReadableStream({
        start: function startSpeechRecognition(controller) {
            recognition.onresult = function postSpeech(event) {
                var results = event.results;
                var i = event.resultIndex, l = results.length, result;
                for (; i < l; i++) {
                    result = results[i].item(0);
                    if (result.confidence > 0.3) {
                        var data = {
                            name: nameField.value,
                            speech: result.transcript
                        }
                        controller.enqueue(data);
                    }
                }
            };
        },
        cancel: function cancelSpeechRecognition(reason) {
            recognition.stop();
        }
    });
}

function attachLogger(loggerElem) {
    return new WritableStream({
        write: function log(message) {
            var li = document.createElement("li");
            li.textContent = "[" +
                (new Date(Number(message.time))).toLocaleString() +
                "]" + message.name +
                ": " + message.speech;
            loggerElem.appendChild(li);
        }
    });
}

function createConsoleSpeechLogger() {
    return new WritableStream({
        write: function logSpeech(message) {
            console.log("speech", message);
        }
    });
}

// TODO: Extract ack part
// TODO: Extract message field handle
function createSpeechPoster() {
    return new WritableStream({
        write: function postSpeech(data) {
            ws.emit("speech", data, function onack(message) {
                console.log("ack", message);
                var log = document.createElement("li");
                log.textContent = "[" +
                    (new Date(Number(message.time))).toLocaleString() +
                    "]" + message.name +
                    ": " + message.speech;
                logger.appendChild(log);
            });
            messageField.value = "";
        }
    });
}

function postSpeech() {
    var data = {
        name: nameField.value,
        speech: messageField.value
    };
    ws.emit("speech", data, function onack(message) {
        console.log("ack", message);
        var log = document.createElement("li");
        log.textContent = "[" +
            (new Date(Number(message.time))).toLocaleString() +
            "]" + message.name +
            ": " + message.speech;
        logger.appendChild(log);
    });
    messageField.value = "";
};

function startRecognition(event) {
    var button = event.target;
    button.removeEventListener("click", startRecognition);
    var recognition = new SpeechRecognition();
    recognition.lang = document.querySelector('[name="lang"]').value || "en";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onaudiostart = function onaudiostart(event) {
        console.log(event.type, event);
    };
    recognition.onsoundstart = function onsoundstart(event) {
        console.log(event.type, event);
    };
    recognition.onspeechstart = function onspeechstart(event) {
        console.log(event.type, event);
    };
    recognition.onspeechend = function onspeechend(event) {
        console.log(event.type, event);
    };
    recognition.onsoundend = function onsoundend(event) {
        console.log(event.type, event);
    };
    recognition.onaudioend = function onaudioend(event) {
        console.log(event.type, event);
    };
    recognition.onresult = function onresult(event) {
        var results = event.results;
        var i = event.resultIndex, l = results.length, result;
        for (; i < l; i++) {
            result = results[i].item(0);
            if (result.confidence > 0.3) {
                messageField.value = result.transcript;
                postSpeech();
            }
        }
    };
    recognition.onnomatch = function onnomatch(event) {
        console.log(event.type, event);
    };
    recognition.onerror = function onerror(event) {
        console.log(event.type, event);
    };
    recognition.onstart = function onstart(event) {
        console.log(event.type, event);
    };
    recognition.onend = function onend(event) {
        console.log(event.type, event);
    };

    document.getElementById("stop-button").onclick = function stopRecognition() {
        recognition.stop();
        button.addEventListener("click", startRecognition);
    };
    recognition.start();
}
