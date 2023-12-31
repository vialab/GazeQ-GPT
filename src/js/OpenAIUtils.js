import JSON5 from "json5";
import { removeStopwords } from 'stopword';
import OpenAI from "openai";

const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY, dangerouslyAllowBrowser: true });

async function retrieveRun(threadId, runId) {
    let retrievingRun = await openai.beta.threads.runs.retrieve(threadId, runId);

    while (retrievingRun.status === "queued" || retrievingRun.status === "in_progress") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        console.log(retrievingRun.status);

        retrievingRun = await openai.beta.threads.runs.retrieve(threadId, runId);
    }
    return retrievingRun;
}

export async function getComplexity(word) {
//     let complexityMessages = [{
//         role: "system",
//         content: `You are an expert on NLP. You analyze the word's complexity using a scale of 1 to 5, with 1 being the least complex and 5 being the most complex.

// Here is some information to analyze the word's complexity:

// 1. Words having multiple meanings are more complex.
    
// 2. The word's higher cognitive load or demand is more complex.
    
// 3. Higher acquisition difficulty of the word is more complex.
    
// 4. Rarer words are more complex.

// Consider that the person reading this word is a university student.`
//         },
//         {
//             role: "user",
//             content: `Word: ${word}`
//         },
//         {
//             role: "assistant",
//             content: `Let's work this out in a step by step way to be sure we have the right answer.`
//         }
//     ]

//     const requestOptions = {
//         method: "POST",
//         headers: {
//             "Content-Type": "application/json",
//             Authorization: "Bearer " + process.env.OPENAI_API_KEY,
//         },
//         body: JSON.stringify({
//             model: "gpt-4",
//             messages: complexityMessages,
//             functions: [
//                 {
//                     "name": "getComplexity",
//                     "description": "Get the word's complexity.",
//                     "parameters": {
//                         "type": "object",
//                         "properties": {
//                             "complexity": {
//                                 "type": "number",
//                                 "description": "The complexity of the word (1-5)",
//                             },
//                         },
//                         "required": ["complexity"],
//                     },
//                 }
//             ],
//             function_call: {"name": "getComplexity"},
//             temperature: 0,
//         }),
//     };

//     return fetch("https://api.openai.com/v1/chat/completions", requestOptions)
//     .then(response => response.json())
//     .then(data => {
//         if (!data.error && data.choices[0].message.function_call) {
//             let score = Number(JSON.parse(data.choices[0].message.function_call.arguments).complexity);

//             if (score < 1 || score > 5) {
//                 console.log(word, score)
//                 throw new Error("Error getting complexity");
//             }
//             return score;
//         } else {
//             console.log(data.error)
//             throw new Error("Error getting complexity");
//         }
//     })
//     .catch(error => {
//         return new Promise((resolve, reject) => {
//             console.log(word)
//             setTimeout(() => {
//                 resolve(getComplexity(word));
//             }, 15000);
//         });
//     });

    return new Promise((resolve, reject) => {
        return resolve(0.5);
    })

    try {
        const thread = await openai.beta.threads.create();

        await openai.beta.threads.messages.create(thread.id, { role: "user", content: `Word: ${word}`});
        await openai.beta.threads.messages.create(thread.id, { role: "user", content: `Make sure to find all sentences that uses the word before giving an answer.`});
        await openai.beta.threads.messages.create(thread.id, { role: "user", content: `Let's work this out in a step by step way to be sure we have the right answer.`});
    
        const run = await openai.beta.threads.runs.create(thread.id, { 
            assistant_id: process.env.COMPLEXITY_ASSISTANT_ID,
        });

        await retrieveRun(thread.id, run.id);
    
        const JSONRun = await openai.beta.threads.runs.create(thread.id, {
            assistant_id: process.env.COMPLEXITY_ASSISTANT_ID,
            instructions: `Output your answer as a JSON object like so:
{
    "complexity": [enter complexity (1-5)]
}`
        });

        await retrieveRun(thread.id, JSONRun.id);
        const m = await openai.beta.threads.messages.list(thread.id);
        console.log(m);
    
        if (m.data[0].content[0].text.value) {
            let regex = /{(\s|.)*}/g;
            let match = (m.data[0].content[0].text.value).match(regex);
            let content = JSON.parse(match[0]);
    
            if (content.complexity && typeof content.complexity == "number" && content.complexity >= 1 && content.complexity <= 5) {
                return content.complexity;
            } else {
                throw new Error("Missing data");
            }
        } else {
            throw new Error("Error getting complexity");
        }
    } catch (error) {
        console.log("error", error);

        return new Promise((resolve, reject) => {
            setTimeout(() => {
                resolve(getComplexity(word));
            }, 10000);
        });
    }
}

// getComplexity("quantum").then(data => console.log(data));

export async function generateQuestion(text, word, initRequestOptions = "", file = "") {
//     const messages = [
//         {
//             role: "system",
//             content: `You are a professor making a multiple-choice test about a video.
            
// Create an advanced multiple-choice question about the video given with four choices. Give the correct answer at the end of the question.

// Here are the criteria for the question:

// 1. The question must have the word: "${word}".

// 2. All choices should explain a concept or an idea in one sentence and be similar in length to each other.

// 3. All incorrect choices must be plausible and related to the correct choice.

// Output your answer as a JSON object like so:
// {
//  "question": [enter question],
//  "choiceA": [enter choice A],
//  "choiceB": [enter choice B],
//  "choiceC": [enter choice C],
//  "choiceD": [enter choice D],
//  "answer": [enter answer (A, B, C, or D)]
// }`
//         },
//         {
//             role: "user",
//             content: `Video:
// ${text}}`,
//         },
//         {
//             role: "assistant",
//             content: `Let's work this out in a step by step way to be sure we have the right question that fits the criteria.`
//         }
//     ];

    // const explanationMessages = (choice, correct = false) => {
    //     return [{
    //         role: "user",
    //         content: `Explain in one sentence why option "${choice}" is ${correct ? "correct" : "incorrect"}. Do not use words in the correct choice.`
    //     },
    //     {
    //         role: "assistant",
    //         content: `Let's work this out in a step by step way to be sure we have the right answer.`
    //     }]
    // }

    // let requestOptions = {
    //     method: "POST",
    //     headers: {
    //         "Content-Type": "application/json",
    //         Authorization: "Bearer " + process.env.OPENAI_API_KEY,
    //     },
    //     body: JSON.stringify({
    //         model: "gpt-4",
    //         messages: messages,
    //         // functions: [
    //         //     {
    //         //         "name": "displayQuestion",
    //         //         "description": "Display question and choices.",
    //         //         "parameters": {
    //         //             "type": "object",
    //         //             "properties": {
    //         //                 "question": {
    //         //                     "type": "string",
    //         //                     "description": "The question to ask",
    //         //                 },
    //         //                 "choiceA": {
    //         //                     "type": "string",
    //         //                     "description": "Choice A to the question",
    //         //                 },
    //         //                 "choiceB": {
    //         //                     "type": "string",
    //         //                     "description": "Choice B to the question",
    //         //                 },
    //         //                 "choiceC": {
    //         //                     "type": "string",
    //         //                     "description": "Choice C to the question",
    //         //                 },
    //         //                 "choiceD": {
    //         //                     "type": "string",
    //         //                     "description": "Choice D to the question",
    //         //                 },
    //         //                 "answer": {
    //         //                     "type": "string",
    //         //                     "description": "The answer to the question (A, B, C, or D)",
    //         //                 },
    //         //             },
    //         //             "required": ["question", "choiceA", "choiceB", "choiceC", "choiceD", "answer"],
    //         //         },
    //         //     }
    //         // ],
    //         max_tokens: 2048,
    //         // function_call: {"name": "displayQuestion"},
    //     }),
    // };

    // let requestOptions2 = (choice, questionData, correct = false) => {
    //     let m = [...messages];
    //     m.push(questionData);
    //     m.push(...explanationMessages(choice, correct));

    //     return {
    //         method: "POST",
    //         headers: {
    //             "Content-Type": "application/json",
    //             Authorization: "Bearer " + process.env.OPENAI_API_KEY,
    //         },
    //         body: JSON.stringify({
    //             model: "gpt-4",
    //             messages: m,
    //             functions: [
    //                 {
    //                     "name": "explainChoice",
    //                     "description": "Exaplain why a choice is correct or incorrect.",
    //                     "parameters": {
    //                         "type": "object",
    //                         "properties": {
    //                             "explanation": {
    //                                 "type": "string",
    //                                 "description": "Explanation of why the choice is correct or incorrect",
    //                             },
    //                         },
    //                         "required": ["explanation"],
    //                     },
    //                 }
    //             ],
    //             function_call: {"name": "explainChoice"},
    //         }),
    //     };
    // }

    let rand = Math.random() * -1;

    return new Promise((resolve, reject) => {
        resolve(JSON.parse(
            `{
                "question": "What is one way we study matter?",
                "choiceA": "Through biology",
                "choiceB": "Through psychology",
                "choiceC": "Through chemistry",
                "choiceD": "Through physics",
                "explanation": {
                    "A": "Biology is the study of living things, not matter.",
                    "B": "Psychology is the study of the mind, not matter.",
                    "C": "Correct! Chemistry is the study of matter.",
                    "D": "Physics is the study of energy and matter, not just matter."
                },
                "answer": "A"
            }`
        ));
    });
    
    try {
        const thread = await openai.beta.threads.create();
    
        await openai.beta.threads.messages.create(thread.id, { role: "user", content: `Video:\n${text}`});
        await openai.beta.threads.messages.create(thread.id, { role: "user", content: `Let's work this out in a step by step way to be sure we have the right question that fits the criteria that you have been given.`});
    
        const run = await openai.beta.threads.runs.create(
            thread.id,
            { 
                assistant_id: process.env.QUESTION_ASSISTANT_ID,
                additional_instructions: `Create an advanced multiple-choice question about the video given with four choices. Give the correct answer at the end of the question.
                
                Here are the criteria for the question:
                
                1. The question must have the word: ${word}.
                
                2. All choices should explain a concept or an idea in one sentence.
                
                3. All incorrect choices must be plausible and related to the correct choice.
    
                4. All choices should have similar number of words to each other.`
            }
        );
    
        await retrieveRun(thread.id, run.id);
    
        const JSONRun = await openai.beta.threads.runs.create(thread.id, { 
            assistant_id: process.env.QUESTION_ASSISTANT_ID,
            instructions: `Output your answer as a JSON object like so:
{
    "question": [enter question],
    "choiceA": [enter choice A],
    "choiceB": [enter choice B],
    "choiceC": [enter choice C],
    "choiceD": [enter choice D],
    "answer": [enter answer (A, B, C, or D)]
}`
        });
    
        await retrieveRun(thread.id, JSONRun.id);
        const m = await openai.beta.threads.messages.list(thread.id);
    
        console.log(m);
        console.log(m.data[0].content[0].text.value);

        if (m.data[0].content[0].text.value) {
            let content = m.data[0].content[0].text.value;
            let regex = /{(\s|.)*}/g;
            let match = content.match(regex);
    
            if (!match && initRequestOptions === "") {
                const run = await openai.beta.threads.runs.create(thread.id);
                await retrieveRun(thread.id, run.id);
                const m = await openai.beta.threads.messages.list(thread.id);

                content = m.data[0].content[0].text.value;
                match = content.match(regex);
            }
            let questionData = JSON5.parse(match[0]);
            let answer = questionData.answer;
            let correctAnswers = [];
    
            if (questionData.choiceA.toLowerCase().trim() === "" || questionData.choiceB.toLowerCase().trim() === "" || questionData.choiceC.toLowerCase().trim() === "" || questionData.choiceD.toLowerCase().trim() === "") {
                throw new Error("One of the choices is empty.");
            }
            
            // for (let answer of answers) {
                if (answer === "A" || answer.toLowerCase() === questionData.choiceA.toLowerCase()) {
                    correctAnswers.push("A");
                } else if (answer === "B" || answer.toLowerCase() === questionData.choiceB.toLowerCase()) {
                    correctAnswers.push("B");
                } else if (answer === "C" || answer.toLowerCase() === questionData.choiceC.toLowerCase()) {
                    correctAnswers.push("C");
                } else if (answer === "D" || answer.toLowerCase() === questionData.choiceD.toLowerCase()) {
                    correctAnswers.push("D");
                } else {
                    throw new Error("No correct answer found.");
                }
            // }
            let incorrectAnswers = ["A", "B", "C", "D"].filter(x => !correctAnswers.includes(x));
            let explanationData = {};
            // let settleFetch = []
    
            let fetchExplanation = async (answer, ifCorrect) => {
                const run = await openai.beta.threads.runs.create(thread.id, { 
                    assistant_id: process.env.QUESTION_ASSISTANT_ID,
                    instructions: `Explain in one sentence why option "${answer}" is ${ifCorrect ? "correct" : "incorrect"}. Do not use words in any of the choice.`
                });

                await retrieveRun(thread.id, run.id);
                const explainData = await openai.beta.threads.messages.list(thread.id);
                console.log(explainData.data[0].content[0].text.value)
    
                if (explainData.data[0].content[0].text.value) {
                    explanationData[answer] = explainData.data[0].content[0].text.value;
                } else {
                    throw new Error("No explanation data found.");
                }
            }
    
            for (let answer of correctAnswers) {
                // settleFetch.push(fetchExplanation(answer, true));
                await fetchExplanation(answer, true)
            }
    
            for (let answer of incorrectAnswers) {
                await fetchExplanation(answer, false)
                // settleFetch.push(fetchExplanation(answer, false));
                // settleFetch.push(() => "");
            }
            // await Promise.all(settleFetch);
            
            questionData.explanation = explanationData;
            return questionData;
        } else {
            throw new Error("Error generating question");
        }
    } catch (error) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                resolve(generateQuestion(text, word, initRequestOptions, file));
            }, 5000);
        });
    }

    // return fetch("https://api.openai.com/v1/chat/completions", initRequestOptions === "" ? requestOptions : initRequestOptions)
    // .then(response => response.json())
    // .then(async data =>  {
    //     if (data.error) {
    //         throw new Error(data.error);
    //     }
    //     if (data.choices[0] && data.choices[0].message) {
    //         let content = data.choices[0].message.content;
    //         let regex = /{(\s|.)*}/g;
    //         let match = content.match(regex);

    //         if (!match && initRequestOptions === "") {
    //             let addRequestOptions = {...requestOptions};
    //             console.log(data.choices[0].message);

    //             addRequestOptions.body = JSON.stringify({
    //                 model: "gpt-4",
    //                 messages: [...messages, data.choices[0].message],
    //                 max_tokens: 2048,
    //             });

    //             return new Promise((resolve, reject) => {
    //                 resolve(generateQuestion(text, word, addRequestOptions));
    //             });
    //         }
    //         let questionData = JSON5.parse(match[0]);
    //         // let questionData = JSON5.parse(data.choices[0].message.function_call.arguments);
    //         let answer = questionData.answer;
    //         let correctAnswers = [];
    //         if (questionData.choiceA.toLowerCase().trim() === "" || questionData.choiceB.toLowerCase().trim() === "" || questionData.choiceC.toLowerCase().trim() === "" || questionData.choiceD.toLowerCase().trim() === "") {
    //             throw new Error("One of the choices is empty.");
    //         }
            
    //         // for (let answer of answers) {
    //             if (answer === "A" || answer.toLowerCase() === questionData.choiceA.toLowerCase()) {
    //                 correctAnswers.push("A");
    //             } else if (answer === "B" || answer.toLowerCase() === questionData.choiceB.toLowerCase()) {
    //                 correctAnswers.push("B");
    //             } else if (answer === "C" || answer.toLowerCase() === questionData.choiceC.toLowerCase()) {
    //                 correctAnswers.push("C");
    //             } else if (answer === "D" || answer.toLowerCase() === questionData.choiceD.toLowerCase()) {
    //                 correctAnswers.push("D");
    //             } else {
    //                 throw new Error("No correct answer found.");
    //             }
    //         // }
    //         let incorrectAnswers = ["A", "B", "C", "D"].filter(x => !correctAnswers.includes(x));
    //         let explanationData = {};
    //         let settleFetch = []

    //         let fetchExplanation = async (answer, q, ifCorrect) => {
    //             return fetch("https://api.openai.com/v1/chat/completions", requestOptions2(answer, q, ifCorrect))
    //             .then(response => response.json())
    //             .then(explainData => {
    //                 if (explainData.error) {
    //                     throw new Error(explainData.error);
    //                 }
    //                 if (explainData.choices[0] && explainData.choices[0].message) {
    //                     let eData = JSON5.parse(explainData.choices[0].message.function_call.arguments).explanation;
    //                     explanationData[answer] = eData;
    //                 } else {
    //                     throw new Error("No explanation data found.");
    //                 }
    //             }).catch(error => {
    //                 console.log("error", error)
                    
    //                 return new Promise((resolve, reject) => {
    //                     setTimeout(() => {
    //                         resolve(fetchExplanation(answer, q, ifCorrect));
    //                     }, 5000);
    //                 });
    //             });
    //         }

    //         for (let answer of correctAnswers) {
    //             settleFetch.push(fetchExplanation(answer, data.choices[0].message, true));
    //         }

    //         for (let answer of incorrectAnswers) {
    //             // settleFetch.push(fetchExplanation(answer, data.choices[0].message, false));
    //             settleFetch.push(() => "");
    //         }

    //         await Promise.all(settleFetch);
           
    //         questionData.explanation = explanationData;
    //         return questionData;
    //     } else {
    //         throw new Error("Error generating question");
    //     }
    // })
    // .catch(error => {
    //     console.log("error", error)
        
    //     return new Promise((resolve, reject) => {
    //         setTimeout(() => {
    //             resolve(generateQuestion(text, word));
    //         }, 5000);
    //     });
    // });
}

export async function getPhrase(term1, term2) {
//     let requestOptions = {
//         method: "POST",
//         headers: {
//             "Content-Type": "application/json",
//             Authorization: "Bearer " + process.env.OPENAI_API_KEY,
//         },
//         body: JSON.stringify({
//             model: "gpt-4",
//             temperature: 0,
//             messages: [
//                 {
//                     role: "system",
//                     content: `You are a language expert. Check if when combining two terms forms a phrase. If so, provide one-sentence definition for each term in the given context and the whole phrase so that a 6 year old can understand. Also, you must provide example sentences using the phrase.`
//                 },
//                 {
//                     role: "user",
//                     content: `"${term1} ${term2}" is a phrase

// A) True
// B) False`,
//                 },
//             ],
//             functions: [
                // {
                //     "name": "displayPhrase",
                //     "description": "Display a simple definition about a given phrase.",
                //     "parameters": {
                //         "type": "object",
                //         "properties": {
                //             "definitionTerm1": {
                //                 "type": "object",
                //                 "description": "The simplified definition of the first term.",
                //                 "properties": {
                //                     "term": {
                //                         "type": "string",
                //                         "description": "The term to define",
                //                     },
                //                     "definition": {
                //                         "type": "string",
                //                         "description": "The simplified definition of the term without using any of the words in the term",
                //                     }
                //                 }
                //             },
                //             "definitionTerm2": {
                //                 "type": "object",
                //                 "description": "The simplified definition of the second term.",
                //                 "properties": {
                //                     "term": {
                //                         "type": "string",
                //                         "description": "The term to define",
                //                     },
                //                     "definition": {
                //                         "type": "string",
                //                         "description": "The simplified definition of the term without using any of the words in the term",
                //                     }
                //                 }
                //             },
                //             "definitionPhrase": {
                //                 "type": "object",
                //                 "description": "A one-sentence definition of the phrase without using any of the words in the phrase",
                //                 "properties": {
                //                     "isPhrase": {
                //                         "type": "boolean",
                //                         "description": "Whether the given phrase is a phrase or not",
                //                     },
                //                     "phrase": {
                //                         "type": "string",
                //                         "description": "The phrase to define",
                //                     },
                //                     "definition": {
                //                         "type": "string",
                //                         "description": "A one-sentence definition of the phrase without using any of the words in the phras",
                //                     }
                //                 }
                //             },
                //             "example": {
                //                 "type": "array",
                //                 "description": "An array of examples of the phrase. Do not change the phrase in any way.",
                //                 "items": {}
                //             }
                //         },
    //                     "required": ["definitionTerm1", "definitionTerm2", "definitionPhrase", "example"],
    //                 },
    //             }
    //         ],
    //         function_call: {"name": "displayPhrase"},
    //     }),
    // };

    
    let rand = Math.random() * -1;

    return new Promise((resolve, reject) => {
        resolve(JSON.parse(`{
            "definitionTerm1": ${rand < 0.5 ? `{
                "term": "${term1}",
                "definition": "${term1} is a ${term1}."
            }` : `{}`},
            "definitionTerm2": ${rand < 0.5 ? `{
                "term": "${term2}",
                "definition": "${term2} is a ${term2}."
            }` : `{}`},
            "definitionPhrase": ${rand < 0.5 ? `{
                "isPhrase": true,
                "phrase": "${term1} ${term2}",
                "definition": "${term1} is a ${term1}. ${term2} is a ${term2}."
            }` : `{}`},
            "example": [${rand < 0.5 ? `"${term1} ${term2} is a ${term1} ${term2}."` : ""}]
        }`));
    });

    try {
        const thread = await openai.beta.threads.create();

        await openai.beta.threads.messages.create(thread.id, { role: "user", content: `"${term1} ${term2}" is a phrase\n\nA) True\nB) False`});
    
        const run = await openai.beta.threads.runs.create(thread.id, {
            assistant_id: process.env.PHRASE_ASSISTANT_ID,
        });

        await retrieveRun(thread.id, run.id);
    
        const JSONRun = await openai.beta.threads.runs.create(thread.id, {
            assistant_id: process.env.PHRASE_ASSISTANT_ID,
            instructions: `Output your answer as a JSON object like so:
{
    "definitionTerm1": {
        "term": [enter first term],
        "definition": [enter definition]
    },
    "definitionTerm2": {
        "term": [enter second term],
        "definition": [enter definition]
    },
    "definitionPhrase": {
        "isPhrase": [enter true or false],
        "phrase": [enter phrase],
        "definition": [enter definition]
    },
    "example": [enter example]
}`});

        await retrieveRun(thread.id, JSONRun.id);
        const m = await openai.beta.threads.messages.list(thread.id);
        // console.log(m);
        console.log(m.data[0].content[0].text.value);

        if (m.data[0].content[0].text.value) {
            let regex = /{(\s|.)*}/g;
            let match = (m.data[0].content[0].text.value).match(regex);
            let content = JSON.parse(match[0]);

            if (content.definitionPhrase && typeof content.definitionPhrase.isPhrase == "boolean" && !content.definitionPhrase.isPhrase) {
                return content
            }

            if (content.definitionTerm1 && "term" in content.definitionTerm1 && "definition" in content.definitionTerm1 &&
                content.definitionTerm2 && "term" in content.definitionTerm2 && "definition" in content.definitionTerm2 &&
                content.definitionPhrase && "isPhrase" in content.definitionPhrase && "phrase" in content.definitionPhrase && "definition" in content.definitionPhrase &&
                "example" in content
            ) {
                return content;
            } else {
                throw new Error("Missing data");
            }
        } else {
            throw new Error("Error getting phrase");
        }
    } catch (error) {
        console.log("error", error);

        return new Promise((resolve, reject) => {
            setTimeout(() => {
                resolve(getPhrase(term1, term2));
            }, 10000);
        });
    }

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
    //         console.log(term1, term2, data.choices[0].message.function_call);
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
}

export async function parsePhrase(text) {
    let phrases = new Map();
    let promises = [];

    for (let i = 0; i < text.length - 1; i++) {
        let phrase = [text[i]];

        let ifStop = removeStopwords([text[i]])[0];
        
        if (!ifStop) {
            continue;
        }

        let promise = new Promise(async (resolve, reject) => {
            for (let j = i; j < text.length - 1; j++) {
                phrase.push(text[j + 1]);
                let ifStop = removeStopwords([phrase[1]])[0];

                if (!ifStop) {
                    phrase = [phrase[0] + " " + phrase[1]];
                    continue;
                }
                let phraseData = await getPhrase(phrase[0], phrase[1]);
                
                if (phraseData) {
                    let data = phraseData;

                    // let mapExample = data.example.map(example => typeof example === "string" && example.toLowerCase().includes(data.definitionPhrase.phrase.toLowerCase())).includes(true);
                    
                    if (
                        Object.keys(data.definitionPhrase).length > 0 && 
                        data.definitionPhrase.isPhrase &&
                        Object.keys(data.definitionTerm1).length > 0 && 
                        Object.keys(data.definitionTerm2).length > 0 && 
                        data.definitionPhrase.phrase.trim() !== "" && 
                        // mapExample &&
                        // data.example.length > 0 &&
                        // data.definitionTerm1.term.toLowerCase() + " " + data.definitionTerm2.term.toLowerCase() === data.definitionPhrase.phrase.toLowerCase() &&
                        (
                            (phrase[0] + " " + phrase[1]).toLowerCase() === data.definitionPhrase.phrase.toLowerCase() ||
                            (phrase[0] + " " + phrase[1]).toLowerCase() === data.definitionTerm1.term.toLowerCase() ||
                            (phrase[0] + " " + phrase[1]).toLowerCase() === data.definitionTerm2.term.toLowerCase()
                        )
                    ) {
                        phrase = [phrase[0] + " " + phrase[1]];
                        phrases.set(phrase[0].toLowerCase(), data);

                        // i += j - i;
                    } else {
                        console.log("Discarded", phrase[0] + " " + phrase[1]);
                        // i += j - i;
                        break;
                    }
                }
            }
            resolve();
        });
        promises.push(promise);
    }
    await Promise.all(promises);
    return phrases;
}