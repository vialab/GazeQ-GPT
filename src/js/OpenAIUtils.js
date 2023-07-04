import JSON5 from "json5";
import { removeStopwords } from 'stopword';

export function getComplexity(word) {
    let complexityMap = new Map();

    let complexityMessages = [{
        role: "system",
        content: `You are an expert on NLP. You analyze the word's complexity using a scale of 1 to 5, with 1 being the least complex and five being the most complex.

Here is some information to analyze the word's complexity:

1. Words having multiple meanings are more complex.
    
2. The word's higher cognitive load or demand is more complex. Consider that the person is learning the language as a second language.
    
3. Higher acquisition difficulty of the word is more complex. Consider that the person is learning language as a second language.
    
4. Rarer words are more complex.`
        },
        {
            role: "user",
            content: `Word: ${word}

Give me the complexity (1-5) of the word.`
        },
        {
            role: "assistant",
            content: `Let's work this out in a step by step way to be sure we have the right answer.`
        }
    ]

    const requestOptions = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + process.env.OPENAI_API_KEY,
        },
        body: JSON.stringify({
            model: "gpt-3.5-turbo-0613",
            messages: complexityMessages,
            functions: [
                {
                    "name": "getComplexity",
                    "description": "Get the word's complexity.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "complexity": {
                                "type": "number",
                                "description": "The complexity of the word (1-5)",
                            },
                        },
                        "required": ["complexity"],
                    },
                }
            ],
            function_call: {"name": "getComplexity"},
            temperature: 0,
        }),
    };

    // return fetch("https://api.openai.com/v1/chat/completions", requestOptions)
    // .then(response => response.json())
    // .then(data => {
    //     if (!data.error && data.choices[0].message.function_call) {
    //         let score = Number(JSON.parse(data.choices[0].message.function_call.arguments).complexity);

    //         if (score < 1 || score > 5) {
    //             console.log(word, score)
    //             throw new Error("Error getting complexity");
    //         }
    //         return score;
    //     } else {
    //         console.log(data.error)
    //         throw new Error("Error getting complexity");
    //     }
    // })
    // .catch(error => {
    //     return new Promise((resolve, reject) => {
    //         console.log(word)
    //         setTimeout(() => {
    //             resolve(getComplexity(word));
    //         }, 15000);
    //     });
    // });

    return new Promise((resolve, reject) => {
        return resolve(0.5);
    })
}

export function generateQuestion(text, word) {
    let requestOptions = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + process.env.OPENAI_API_KEY,
        },
        body: JSON.stringify({
            model: "gpt-3.5-turbo-16k-0613",
            messages: [
                {
                    role: "system",
                    content: `You are a professor making a multiple-choice test about a video.
                    `
                },
                {
                    role: "user",
                    content: `Text:
${text}

Create a multiple-choice question about the text given with four choices. Give the correct answer at the end of the question.

Here are the criteria for the question:

1. The question should be third-person. 

2. There must only be one correct answer

3. The correct answer must contain the word/phrase: '${word}'. 

4. Three incorrect answers that does not involve the text.
                    `,
                },
                {
                    role: "assistant",
                    content: `Let's work this out in a step by step way to be sure we have the right answer.`
                }
            ],
            functions: [
                {
                    "name": "displayQuestion",
                    "description": "Display question and choices.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "question": {
                                "type": "string",
                                "description": "The question to ask",
                            },
                            "choiceA": {
                                "type": "string",
                                "description": "The first choice to the question",
                            },
                            "choiceB": {
                                "type": "string",
                                "description": "The second choice to the question",
                            },
                            "choiceC": {
                                "type": "string",
                                "description": "The third choice to the question",
                            },
                            "choiceD": {
                                "type": "string",
                                "description": "The fourth choice to the question",
                            },
                            "answer": {
                                "type": "array",
                                "description": "The answer to the question (A, B, C, or D)",
                                "items": {}
                            },
                        },
                        "required": ["question", "choiceA", "choiceB", "choiceC", "choiceD", "answer"],
                    },
                }
            ],
            function_call: {"name": "displayQuestion"},
        }),
    };

    // return fetch("https://api.openai.com/v1/chat/completions", requestOptions)
    // .then(response => response.json())
    // .then(data => {
    //     if (data.error) {
    //         console.log(data.error);
    //         return new Promise((resolve, reject) => {
    //             setTimeout(() => {
    //                 resolve(generateQuestion(text, word));
    //             }, 15000);
    //         });
    //     }
    //     if (data.choices[0] && data.choices[0].message) {
    //         console.log(data.choices[0].message.function_call);
    //         return data.choices[0].message.function_call;
    //     } else {
    //         return new Promise((resolve, reject) => {
    //             setTimeout(() => {
    //                 resolve(generateQuestion(text, word));
    //             }, 15000);
    //         });
    //     }
    // })
    // .catch(error => console.log("error", error));

    return new Promise((resolve, reject) => {
        resolve({
            "arguments": `{"question": "What is one way we study matter?",
            "choiceA": "Through biology",
            "choiceB": "Through psychology",
            "choiceC": "Through chemistry",
            "choiceD": "Through physics",
            "answer": ["A","Through chemistry"]}`
        });
    });
}

export function getPhrase(term1, term2) {
    let requestOptions = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + process.env.OPENAI_API_KEY,
        },
        body: JSON.stringify({
            model: "gpt-3.5-turbo-0613",
            temperature: 0,
            messages: [
                {
                    role: "system",
                    content: `You are a language expert. Check if when combining two terms forms a phrase. If so, provide short definitions for each word in the given context and the whole phrase so that a 6 year old can understand. Also, you must provide example sentences using the phrase.`
                },
                {
                    role: "user",
                    content: `"${term1} ${term2}" is a phrase
A) True
B) False`,
                },
            ],
            functions: [
                {
                    "name": "displayPhrase",
                    "description": "Display a definition about a given phrase.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "definitionTerm1": {
                                "type": "object",
                                "description": "The definition of the first term.",
                                "properties": {
                                    "term": {
                                        "type": "string",
                                        "description": "The term to define",
                                    },
                                    "definition": {
                                        "type": "string",
                                        "description": "The definition of the term",
                                    }
                                }
                            },
                            "definitionTerm2": {
                                "type": "object",
                                "description": "The definition of the second term.",
                                "properties": {
                                    "term": {
                                        "type": "string",
                                        "description": "The term to define",
                                    },
                                    "definition": {
                                        "type": "string",
                                        "description": "The definition of the term",
                                    }
                                }
                            },
                            "definitionPhrase": {
                                "type": "object",
                                "description": "The definition of the phrase.",
                                "properties": {
                                    "phrase": {
                                        "type": "string",
                                        "description": "The phrase to define",
                                    },
                                    "definition": {
                                        "type": "string",
                                        "description": "The definition of the phrase",
                                    }
                                }
                            },
                            "example": {
                                "type": "array",
                                "description": "An array of examples of the phrase.",
                                "items": {}
                            }
                        },
                        "required": ["definitionTerm1", "definitionTerm2", "definitionPhrase", "example"],
                    },
                }
            ],
            function_call: {"name": "displayPhrase"},
        }),
    };

    // return fetch("https://api.openai.com/v1/chat/completions", requestOptions)
    // .then(response => response.json())
    // .then(data => {
    //     if (data.error) {
    //         console.log(data.error);
    //         return new Promise((resolve, reject) => {
    //             setTimeout(() => {
    //                 resolve(getPhrase(term1, term2));
    //             }, 15000);
    //         });
    //     }
    //     if (data.choices[0] && data.choices[0].message) {
    //         console.log(data.choices[0].message.function_call);
    //         return data.choices[0].message.function_call;
    //     } else {
    //         return new Promise((resolve, reject) => {
    //             setTimeout(() => {
    //                 resolve(getPhrase(term1, term2));
    //             }, 15000);
    //         });
    //     }
    // })
    // .catch(error => console.log("error", error));

    let rand = Math.random() * -1;

    return new Promise((resolve, reject) => {
        resolve({
            "arguments": `{
                "definitionTerm1": ${rand < 0.5 ? `{
                    "term": "${term1}",
                    "definition": "${term1} is a ${term1}."
                }` : `{}`},
                "definitionTerm2": ${rand < 0.5 ? `{
                    "term": "${term2}",
                    "definition": "${term2} is a ${term2}."
                }` : `{}`},
                "definitionPhrase": ${rand < 0.5 ? `{
                    "phrase": "${term1} ${term2}",
                    "definition": "${term1} is a ${term1}. ${term2} is a ${term2}."
                }` : `{}`},
                "example": [${rand < 0.5 ? `"${term1} ${term2} is a ${term1} ${term2}."` : ""}]
            }`
        });
    });
}

export async function parsePhrase(text) {
    let phrases = new Map();

    for (let i = 0; i < text.length - 1; i++) {
        let phrase = [text[i]];

        let ifStop = removeStopwords([text[i]])[0];
        
        if (!ifStop) {
            continue;
        }

        for (let j = i; j < text.length - 1; j++) {
            phrase.push(text[j + 1]);
            let ifStop = removeStopwords([phrase[1]])[0];

            if (!ifStop) {
                phrase = [phrase[0] + " " + phrase[1]];
                continue;
            }
            let phraseData = await getPhrase(phrase[0], phrase[1]);
            
            if (phraseData) {
                let data = JSON5.parse(phraseData.arguments);

                let mapExample = data.example.map(example => typeof example === "string" && example.toLowerCase().includes(data.definitionPhrase.phrase.toLowerCase())).includes(true);
                
                if (Object.keys(data.definitionTerm1).length > 0 && 
                    Object.keys(data.definitionTerm2).length > 0 && 
                    Object.keys(data.definitionPhrase).length > 0 && 
                    data.definitionPhrase.phrase.trim() !== "" && 
                    mapExample &&
                    data.example.length > 0 &&
                    // data.definitionTerm1.term.toLowerCase() + " " + data.definitionTerm2.term.toLowerCase() === data.definitionPhrase.phrase.toLowerCase() &&
                    (phrase[0] + " " + phrase[1]).toLowerCase() === data.definitionPhrase.phrase.toLowerCase()
                ) {
                    phrase = [phrase[0] + " " + phrase[1]];
                    phrases.set(phrase[0].toLowerCase(), data);

                    // i += j - i;
                } else {
                    // i += j - i;
                    break;
                }
            }
        }
    }
    return phrases;
}