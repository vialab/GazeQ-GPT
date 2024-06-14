import JSON5 from "json5";
import { removeStopwords } from 'stopword';
import OpenAI from "openai";

const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY, dangerouslyAllowBrowser: true });

export async function getComplexity(word) {
    return new Promise((resolve, reject) => {
        return resolve(0.5);
    })

    try {
        const thread = await openai.beta.threads.create();

        await openai.beta.threads.messages.create(thread.id, { role: "user", content: `Word: ${word}`});
        await openai.beta.threads.messages.create(thread.id, { role: "user", content: `Make sure to find all sentences that uses the word before giving an answer.`});
        await openai.beta.threads.messages.create(thread.id, { role: "user", content: `Let's work this out in a step by step way to be sure we have the right answer.`});
    
        const run = await openai.beta.threads.runs.createAndPoll(thread.id, { 
            assistant_id: process.env.COMPLEXITY_ASSISTANT_ID,
        });

        // await retrieveRun(thread.id, run.id);
    
        const JSONRun = await openai.beta.threads.runs.createAndPoll(thread.id, {
            assistant_id: process.env.COMPLEXITY_ASSISTANT_ID,
            instructions: `Output your answer as a JSON object like so:
{
    "complexity": [enter complexity (1-5)]
}`
        });

        // await retrieveRun(thread.id, JSONRun.id);
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

export async function generateQuestion(text, word, initRequestOptions = "", file = "") {
    // let rand = Math.random() * -1;

    // return new Promise((resolve, reject) => {
    //     resolve(JSON.parse(
    //         `{
    //             "question": "What is one way we study matter?",
    //             "choiceA": "Through biology",
    //             "choiceB": "Through psychology",
    //             "choiceC": "Through chemistry",
    //             "choiceD": "Through physics",
    //             "explanation": {
    //                 "A": "Biology is the study of living things, not matter.",
    //                 "B": "Psychology is the study of the mind, not matter.",
    //                 "C": "Correct! Chemistry is the study of matter.",
    //                 "D": "Physics is the study of energy and matter, not just matter."
    //             },
    //             "answer": "A"
    //         }`
    //     ));
    // });
    
    try {
        const thread = await openai.beta.threads.create();
    
        await openai.beta.threads.messages.create(thread.id, { role: "user", content: `Create an advanced multiple-choice question about the video given with four choices. Give the correct answer at the end of the question.

Here are the criteria for the question:

1. The question must have the word: ${word}.

2. All choices should explain a concept or an idea in one sentence.

3. All incorrect choices must be from the video and related to the correct choice.

4. All choices should have similar number of words to each other.`});
        await openai.beta.threads.messages.create(thread.id, { role: "user", content: `Video:\n${text}`});
        await openai.beta.threads.messages.create(thread.id, { role: "assistant", content: `Let's work this out in a step by step way to be sure we have the right question that fits the criteria that you have been given.`});
        
        let assistant = await openai.beta.assistants.retrieve(process.env.QUESTION_ASSISTANT_ID);
        let vectorStoreID = assistant.tool_resources.file_search?.vector_store_ids[0];
        let vectorStore = await openai.beta.vectorStores.retrieve(vectorStoreID);
        console.log("Checking vector store status...", vectorStore.status);
    
        while (vectorStore.status !== "completed") {
            await new Promise(r => setTimeout(r, 1000));
            vectorStore = await openai.beta.vectorStores.retrieve(vectorStoreID);
            console.log("Checking vector store status...", vectorStore.status);
        }

        const run = await openai.beta.threads.runs.createAndPoll(
            thread.id,
            { 
                assistant_id: process.env.QUESTION_ASSISTANT_ID,
                tool_choice: { type: "file_search" }
            }
        );
    
        // await retrieveRun(thread.id, run.id);
    
        const JSONRun = await openai.beta.threads.runs.createAndPoll(thread.id, { 
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
    
        // await retrieveRun(thread.id, JSONRun.id);
        const m = await openai.beta.threads.messages.list(thread.id);
    
        console.log(m);
        console.log(m.data[0].content[0].text.value);
        console.log(word)

        if (m.data[0].content[0].text.value) {
            let content = m.data[0].content[0].text.value;
            let regex = /{(\s|.)*}/g;
            let match = content.match(regex);
    
            if (!match && initRequestOptions === "") {
                const run = await openai.beta.threads.runs.createAndPoll(thread.id);
                // await retrieveRun(thread.id, run.id);
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
            let settleFetch = [];
    
            let fetchExplanation = async (answer, ifCorrect) => {
                try {

                    const t = await openai.beta.threads.create();
                    // Readd the question and choices
                    await openai.beta.threads.messages.create(t.id, { role: "user", content: `Question: ${questionData.question}\n\nA) ${questionData.choiceA}\nB) ${questionData.choiceB}\nC) ${questionData.choiceC}\nD) ${questionData.choiceD}\n\nAnswer: ${questionData.answer}`});
                    await openai.beta.threads.messages.create(t.id, { role: "user", content: `Explain in one sentence why option "${answer}" is ${ifCorrect ? "correct" : "incorrect"}. Do not use words in any of the choices.`});
    
                    const run = await openai.beta.threads.runs.createAndPoll(t.id, { 
                        assistant_id: process.env.QUESTION_ASSISTANT_ID,
                        tool_choice: { type: "file_search" },
                    });
    
                    // await retrieveRun(t.id, run.id);
                    const explainData = await openai.beta.threads.messages.list(t.id);
                    console.log(explainData)
        
                    if (explainData.data[0].content[0].text.value && run.status === "completed") {
                        explanationData[answer] = explainData.data[0].content[0].text.value.replace(/【(\s|.)*†source】/g, "");
                    } else {
                        throw new Error("No explanation data found.");
                    }
                } catch (error) {
                    console.log("error", error);
                    
                    return new Promise((resolve, reject) => {
                        setTimeout(() => {
                            resolve(fetchExplanation(answer, ifCorrect));
                        }, 1000);
                    });
                }
            }
    
            for (let answer of correctAnswers) {
                settleFetch.push(fetchExplanation(answer, true));
                // await fetchExplanation(answer, true)
            }
    
            for (let answer of incorrectAnswers) {
                // await fetchExplanation(answer, false)
                settleFetch.push(fetchExplanation(answer, false));
                // settleFetch.push(() => "");
            }
            await Promise.all(settleFetch);
            
            questionData.explanation = explanationData;
            return questionData;
        } else {
            throw new Error("Error generating question");
        }
    } catch (error) {
        console.log("error", error);

        return new Promise((resolve, reject) => {
            setTimeout(() => {
                resolve(generateQuestion(text, word, initRequestOptions, file));
            }, 5000);
        });
    }
}

export async function getPhrase(term1, term2) {    
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
    
        const run = await openai.beta.threads.runs.createAndPoll(thread.id, {
            assistant_id: process.env.PHRASE_ASSISTANT_ID,
        });

        // await retrieveRun(thread.id, run.id);
    
        const JSONRun = await openai.beta.threads.runs.createAndPoll(thread.id, {
            assistant_id: process.env.PHRASE_ASSISTANT_ID,
            response_format: {type: "json_object"},
            additional_instructions: `Output your answer as a JSON object like so:
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

        // await retrieveRun(thread.id, JSONRun.id);
        const m = await openai.beta.threads.messages.list(thread.id);
        console.log(m);
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