import React, { useRef, useEffect, useState } from "react";
import * as d3 from "d3";   
import RBFChain from "../js/RBFChain";
import { parseSync } from 'subtitle';
import * as tokenize from 'words-n-numbers';
import { removeStopwords } from 'stopword';
import { ipcRenderer } from "electron";
import { generateQuestion } from "../js/OpenAIUtils";
import OneEuroFilter from "../js/oneeuro.js";
import { toast } from 'react-toastify';
import "../assets/css/Home.css";

import Player from "./Player";
import QuestionForm from "./QuestionForm";
import videojs from "video.js";
import DefinitionsContainer from "./DefinitionsContainer";

import fs from "fs";

function isTooLight(hexcolor){
    var r = parseInt(hexcolor.substr(0,2),16);
    var g = parseInt(hexcolor.substr(2,2),16);
    var b = parseInt(hexcolor.substr(4,2),16);
    var yiq = ((r*299)+(g*587)+(b*114))/1000;
    return yiq >= 128;
}

function rectCircleColliding(circle, rect) {
    let distX = Math.abs(circle.x - rect.x - rect.width / 2);
    let distY = Math.abs(circle.y - rect.y - rect.height / 2);
    
    if (distX > rect.width / 2 + circle.r || distY > rect.height / 2 + circle.r) {
        return false;
    }

    if (distX <= rect.width / 2 || distY <= rect.height / 2) {
        return true;
    }
    let dx = distX - rect.width / 2;
    let dy = distY - rect.height / 2;

    return dx * dx + dy * dy <= circle.r * circle.r;
}

function ptInCircle(circle,cursor) {
    let x1 = cursor.x;
    let y1 = cursor.y;
    let x2 = circle.x;
    let y2 = circle.y;
    let r1 = cursor.r;
    let r2 = circle.r;

    var d = Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2));
 
    if (d <= r1 - r2) {
        return -1;
    } else if (d <= r2 - r1) {
        return -1;
    } else if (d < r1 + r2) {
        return 0;
    } else if (d === r1 + r2) {
        return 0;
    } else {
        return 1;
    }
}

function replacer(key, value) {
    if (value instanceof Map) {
        return {
            dataType: "Map",
            value: Array.from(value.entries()),
        };
    } else {
        return value;
    }
}

function reviver(key, value) {
    if (typeof value === "object" && value !== null) {
        if (value.dataType === "Map") {
            return new Map(value.value);
        }
    }
    return value;
}

function *shuffle(array) {
    var i = array.length;

    while (i--) {
        yield array.splice(Math.floor(Math.random() * (i + 1)), 1)[0];
    }
}

function runPromisesInBatches(promises, batchSize, batchFunction) {
    function runBatch(batch) {
        return Promise.all(
            batch.map((b) => {
                return batchFunction(b);
            })
        );
    }
    const batches = [];

    for (let i = 0; i < promises.length; i += batchSize) {
        batches.push({
            promises: promises.slice(i, i + batchSize),
        });
    }

    return batches.reduce(async (chain, batch) => {
        return chain.then(() => runBatch(batch.promises));
    }, Promise.resolve());
}

function getCollocation(text, phrases, complexityMap, secondary = false, additionalPhrases = new Map(), checkComplexity = true) {
    let words = tokenize.extract(text, { toLowercase: true, regex: [tokenize.words, tokenize.numbers] });
    let uniquePhrases = new Set();

    for (let i = 0; i < words.length - 1; i++) {
        let phrase = [words[i]];
        let wordPhrase = [words[i]];
        let ifStop = removeStopwords([words[i]])[0];
        
        if (!ifStop) {
            continue;
        }

        for (let j = i; j < words.length - 1; j++) {
            phrase.push(words[j + 1]);
            wordPhrase.push(words[j + 1]);
            let ifStop = removeStopwords([phrase[1]])[0];

            if (!ifStop) {
                if (secondary) {
                    i += j - i + 1;
                    break;
                }
                phrase = [phrase[0] + " " + phrase[1]];
                continue;
            }
            phrase = [phrase[0] + " " + phrase[1]];
            let complexity = wordPhrase.map(word => complexityMap.get(word) || 0).reduce((a, b) => a + b, 0) / wordPhrase.length;

            if (phrase[0] !== text.toLowerCase() && (phrases.has(phrase[0]) || (secondary && additionalPhrases.has(phrase[0]))) && text.toLowerCase().replace(/(?:\r\n|\r|\n)/g, ' ').replace("-", " ").includes(phrase[0])) {
                let add = true;

                if (Math.round(complexity * 10) / 10 <= 1  && checkComplexity) {
                    add = false;
                    break;
                }

                if (add) {
                    uniquePhrases.add([...wordPhrase]);
                }
            }
        }
    }

    if (uniquePhrases.size === 1 && !secondary) {
        let checkSecondary = getCollocation(text, phrases, complexityMap, true, additionalPhrases, checkComplexity);
        return (checkSecondary.size > 0 ? checkSecondary : uniquePhrases)
    } else if (uniquePhrases.size === 0 && checkComplexity > 0) {
        return getCollocation(text, phrases, complexityMap, secondary, additionalPhrases, false);
    } else {
        return uniquePhrases;
    }
}

export default function Home({ srcInit, trackInit, complexityData, phraseDefinitions, llm, questions, mouseEnabled, forcePause, toggleDefinitions, showDefinitions, definitionCallback, definitionContainerCallback, endCallback, record, recordCallback, fileData }) {
    let [ questionData, setQuestion ] = useState("");
    let [ paused, setPaused ] = React.useState(true);
    let [ videoTime, setVideoTime ] = React.useState(-1);
    let [ src, setSrc ] = React.useState(srcInit);
    let [ track, setTrack ] = React.useState(trackInit);
    let [ collocations, setCollocations ] = React.useState(null);
    let [ showDefinitionContainer, setShowDefinitionContainer ] = React.useState(!toggleDefinitions);
    let [ showDefinition, setShowDefinition ] = React.useState(false);
    let [ showMoreInfo, setShowMoreInfo ] = React.useState(false);
    let [ onPrev, setOnPrev ] = React.useState(false);
    let [ definitionCallbackState, setDefinitionCallbackState ] = React.useState(null);
    
    let [ textTrackChangeCallback, setTextTrackChangeCallback] = React.useState(null);
    let [ resizeCallback, setResizeCallback] = React.useState(null);
    
    let wordScores = useRef(new Map());
    let frameScores = useRef(new Map());
    let definitionScores = useRef(new Map());
    let definitionToggle = useRef(toggleDefinitions);
    let index = useRef(-1), delayIndex = useRef(-1);
    let rawCaptions = useRef([]);
    let pauseRef = useRef(false), forcePauseRef = useRef(true), end = useRef(false), onQuestions = useRef(false);
    let complexityMap = useRef(JSON.parse(JSON.stringify(complexityData), reviver));
    let phrases = useRef(JSON.parse(JSON.stringify(phraseDefinitions), reviver));
    let additionalPhrases = useRef(new Map());
    let x = useRef(0), y = useRef(0);
    let endCallbackRef = useRef(endCallback);
    let llmRef = useRef(llm);
    let questionsRef = useRef(questions);
    let ifRecord = useRef(record);
    let headDistancesRef = useRef(40);
    let fileUploadRef = useRef(false);

    let eyeGazeRecordData = useRef([]);
    let questionRecordData = useRef([]);
    let definitionRecordData = useRef([]);
    let scoresRecordData = useRef({});
    
    let checkOverlap = (uniquePhrases, text) => {
        if (uniquePhrases.length <= 1) {
            return uniquePhrases;
        }
        let newPhrases = [];

        let getCutIndex = (prevPhrase, nextPhrase) => {
            let tPhrase = (nextPhrase.length < prevPhrase.length) ? nextPhrase : prevPhrase;
            let cutIndex = 0;

            loop: for (let j = 0; j < tPhrase.length; j++) {
                let cutPrevPhrase = prevPhrase.slice(prevPhrase.length - 1 - j, prevPhrase.length);
                let cutNextPhrase = nextPhrase.slice(0, j + 1);
                
                for (let i = 0; i < cutPrevPhrase.length; i++) {
                    if (cutPrevPhrase[i] !== cutNextPhrase[i]) {
                        continue loop;
                    }
                }

                if (text.toLowerCase().replace("-", " ").includes((prevPhrase.join(" ") + " " + nextPhrase.slice(j + 1, nextPhrase.length).join(" ")).trim())) {
                    cutIndex = j + 1;
                }
            }
            return cutIndex;
        }

        let getBlock = (index) => {
            let firstBlock = [uniquePhrases[index]];

            for (let j = index + 1; j < uniquePhrases.length; j++) {
                if (uniquePhrases[j].join(" ").startsWith(uniquePhrases[index].join(" "))) {
                    firstBlock.push(uniquePhrases[j]);
                    index++;
                } else {
                    break;
                }
            }
            return [firstBlock, index];
        }
        let firstBlockIndex = 0, secondBlockIndex = 0;

        main: while (secondBlockIndex < uniquePhrases.length) {
            let [firstBlock, firstIndex] = getBlock(firstBlockIndex);
            let startFirstIndex = 0, startSecondIndex = 0;
            let [secondBlock, secondIndex] = getBlock(firstIndex + 1);
            let optimalIndex = 0, noOverlap = false;

            if (firstIndex + 1 < uniquePhrases.length) {
                for (let i = 0; i < firstBlock.length; i++) {                    
                    if (
                        firstBlock[i].join(" ").endsWith(secondBlock[secondBlock.length - 1].join(" "))
                    ) {
                        if (newPhrases.length > 0) {
                            let cutIndex = getCutIndex(newPhrases[newPhrases.length - 1], firstBlock[i]);
    
                            if (cutIndex > 0) {
                                uniquePhrases.splice(firstIndex - firstBlock.length, firstBlock.length);

                                if (secondBlockIndex - firstBlock.length + 1 === uniquePhrases.length && startSecondIndex === 0) {
                                    newPhrases.push(uniquePhrases[uniquePhrases.length - 1]);
                                }
                                secondBlockIndex -= firstBlock.length - 1;
                                continue main;
                            }
                        }
                        uniquePhrases.splice(firstIndex + 1, secondBlock.length);

                        if (secondBlockIndex === uniquePhrases.length && startSecondIndex === 0) {
                            newPhrases.push(uniquePhrases[uniquePhrases.length - 1]);
                        }
                        continue main;
                    }
                }
            } else {
                newPhrases.push(uniquePhrases[uniquePhrases.length - 1]); 
                break main;
            }
            
            while (startFirstIndex < firstBlock.length && startSecondIndex < secondBlock.length) {
                let firstPhrase = firstBlock[startFirstIndex];
                let secondPhrase = secondBlock[startSecondIndex];

                let cutIndex = getCutIndex(firstPhrase, secondPhrase);

                if (cutIndex === 0 && !firstPhrase.includes(secondPhrase)) {
                    optimalIndex = startFirstIndex;
                    startFirstIndex++;
                    noOverlap = true;
                } else
                if (firstPhrase.join(" ").endsWith(secondPhrase.join(" "))) {
                    if (!noOverlap) {
                        
                        optimalIndex = startFirstIndex;
                        startSecondIndex++;
                    } else {
                        startFirstIndex++;
                    }
                } else {
                    if (optimalIndex > 0 && firstPhrase.includes(secondPhrase))
                        optimalIndex--;
                    break;
                }
            }

            if (startFirstIndex === firstBlock.length - 1 && startSecondIndex === secondBlock.length) {
                uniquePhrases.splice(firstIndex + 1, secondBlock.length);
                secondBlockIndex = firstIndex + 1;

                if (secondBlockIndex === uniquePhrases.length) {
                    newPhrases.push(firstBlock[optimalIndex]);
                }
            } else {
                firstBlockIndex = firstIndex + 1;
                secondBlockIndex = secondIndex + 1;
                newPhrases.push(firstBlock[optimalIndex]);
            }

            if (secondBlockIndex === uniquePhrases.length && startSecondIndex === 0) {
                newPhrases.push(secondBlock[secondBlock.length - 1]);
            }
        }
        let change = true;

        while (change) {
            change = false;

            for (let i = 1; i < newPhrases.length - 1; i++) {
                let prevPhrase = [...newPhrases[i - 1]];
                let currPhrase = [...newPhrases[i]];
                let nextPhrase = [...newPhrases[i + 1]];

                let cutIndex = getCutIndex(prevPhrase, currPhrase);
                let cutIndex2 = getCutIndex(currPhrase, nextPhrase);

                if (cutIndex + cutIndex2 >= currPhrase.length) {
                    newPhrases.splice(i, 1);
                    change = true;
                }
            }

            for (let i = 1; i < newPhrases.length - 1; i++) {
                let prevPhrase = [...newPhrases[i - 1]];
                let currPhrase = [...newPhrases[i]];
                let nextPhrase = [...newPhrases[i + 1]];
    
                let cutIndex = getCutIndex(prevPhrase, currPhrase);
                let cutIndex2 = getCutIndex(currPhrase, nextPhrase);
                
                currPhrase.splice(0, cutIndex);
                currPhrase.splice(currPhrase.length - cutIndex2, cutIndex2);
                
                if (text.toLowerCase().includes(prevPhrase.join(" ") + " " + currPhrase.join(" ") + (currPhrase.length > 0 ? " " : "") + nextPhrase.join(" ")) && 
                    currPhrase.map(word => complexityMap.current.get(word) || 0).filter(x => x > 0).length === 0
                ) {
                    change = true;
                    newPhrases.splice(i, 1);
                }
            }

            for (let i = 1; i < newPhrases.length; i++) {
                let prevPhrase = [...newPhrases[i - 1]];
                let currPhrase = [...newPhrases[i]];

                let cutIndex = getCutIndex(prevPhrase, currPhrase);

                if (cutIndex > 0) {
                    let cutPrevPhrase = [...prevPhrase].slice(0, prevPhrase.length - cutIndex).map(word => complexityMap.current.get(word) || 0);
                    let cutCurrPhrase = [...currPhrase].slice(cutIndex).map(word => complexityMap.current.get(word) || 0);

                    if (cutCurrPhrase.reduce((a, b) => a + b, 0) < cutPrevPhrase.reduce((a, b) => a + b, 0)) {
                        newPhrases.splice(i, 1);
                        change = true;
                    } else {
                        newPhrases.splice(i - 1, 1);
                        change = true;
                    }
                }
            }
        }
        return newPhrases;
    }
    
    let timerCallback = (t) => {
        let prevIndex = delayIndex.current;
        index.current = -1;
        delayIndex.current = -1;
        
        if (t > 0) {
            end.current = false;
        }

        for (let i = 0; i < rawCaptions.current.length; i++) {
            let startTime = rawCaptions.current[i].data.start;
            let endTime = rawCaptions.current[i].data.end;
            let delayEndTime = rawCaptions.current[i].data.end + 500;

            if (t * 1000 >= startTime && t * 1000 <= endTime && index.current === -1) {
                index.current = i;
            }

            if (t * 1000 >= startTime && t * 1000 <= delayEndTime && delayIndex.current === -1) {
                delayIndex.current = i;
            }
            
            if (t * 1000 < startTime + 500) {
                break;
            }
        }
        
        if (prevIndex !== delayIndex.current && delayIndex.current >= 0 && rawCaptions.current[delayIndex.current]) {
            let subTitle = rawCaptions.current[delayIndex.current].data.text.toLowerCase().replace(/(?:\r\n|\r|\n)/g, ' ').replace("-", " ");
            let uniquePhrases = checkOverlap([...getCollocation(rawCaptions.current[delayIndex.current].data.text, phrases.current, complexityMap.current)], rawCaptions.current[delayIndex.current].data.text.replace(/(?:\r\n|\r|\n)/g, ' '));
            
            if (uniquePhrases.length === 1) {
                let newUniquePhrases = checkOverlap([...getCollocation(uniquePhrases[0].join(" "), phrases.current, complexityMap.current)], rawCaptions.current[delayIndex.current].data.text.replace(/(?:\r\n|\r|\n)/g, ' '));
                
                if (newUniquePhrases.length > 1) {
                    uniquePhrases = newUniquePhrases;
                }
            }
            
            let definitionsList = new Map();
            let startIndex = 0;
            
            let slicePhrase = (phrase, subTitle, map, startIndex, ifSlice = false) => {
                let slice = subTitle.search(phrase.join(" ").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
                let sliceSubtitle = ifSlice ? phrase.join(" ") : subTitle.slice(startIndex, slice);
                let chunkWords = tokenize.extract(sliceSubtitle, { toLowercase: true, regex: [tokenize.words] });
                startIndex = slice + phrase.join(" ").length;
                
                if (chunkWords) {
                    let setWords = new Map()

                    chunk: for (let word of chunkWords) {
                        if (complexityMap.current.get(word) > (map === definitionsList ? (uniquePhrases.length === 0 ? 1 : 3) : 2) && additionalPhrases.current.get(word)) {
                            let d = additionalPhrases.current.get(word);
                            d.complexity = complexityMap.current.get(word);

                            for (let phrase of uniquePhrases) {
                                let phraseDefinition = phrases.current.get(phrase.join(" ")) || additionalPhrases.current.get(phrase.join(" "));

                                if (phraseDefinition.definitionPhrase.phrase.toLowerCase().includes(word)) {
                                    continue chunk;
                                }

                                for (let i = 1; "definitionTerm" + i in phraseDefinition; i++) {
                                    if (phraseDefinition["definitionTerm" + i].term.toLowerCase().includes(word)) {
                                        continue chunk;
                                    }
                                }
                            }
                            setWords.set(word, d);
                        }
                    }

                    let minComplexity = setWords.size > 0 ? 2 : 0;

                    for (let [word, d] of setWords) {
                        if (d.complexity > minComplexity) {
                            map.set(word, {
                                "subtitle": word,
                                "collocation": [word],
                                "definitions": d,
                                "additional": null,
                                ...d
                            });
                        }
                    }
                }
                return startIndex;
            }
            
            for (let i = 0; i < uniquePhrases.length; i++) {
                let phrase = uniquePhrases[i];
                let slice = subTitle.search(phrase.join(" ").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
                let sliceSubtitle = rawCaptions.current[delayIndex.current].data.text.slice(slice, slice + phrase.join(" ").length);
                let definitions = phrases.current.get(phrase.join(" "));
                let complexity = phrase.map(word => complexityMap.current.get(word) || 0).reduce((a, b) => a + b, 0) / phrase.length;
                definitions.complexity = complexity;
                let additional = new Map();
                startIndex = slicePhrase(phrase, subTitle, definitionsList, startIndex);
                let d = {"subtitle": sliceSubtitle, "collocation": phrase, "definitions": definitions, "additional": additional};
                definitionsList.set(phrase.join(" "), d);
            }

            if (uniquePhrases.length > 0) {
                slicePhrase([subTitle.slice(startIndex)], subTitle, definitionsList, startIndex, true);
            } else {
                slicePhrase([subTitle], subTitle, definitionsList, startIndex, true);
            }
            setCollocations(definitionsList);
        } else if (delayIndex.current < 0) {
            setCollocations(null);
        }
        setShowDefinition(null);
        setShowMoreInfo(false);
    };

    let playerEndCallback = async () => {
        if (ifRecord.current) {
            eyeGazeRecordData.current.splice(1, 0, {timestamp: Date.now(), message: "PlayerEnd"});
        }
        if (onQuestions.current) {
            return;
        }
        onQuestions.current = true;
        end.current = true;
        forcePauseRef.current = true;

        let addScores = (map) => {
            let sortScores = new Map();

            for (let [word, scores] of map) {
                for (let [index, score] of scores) {
                    if (sortScores.has(word + index)) {
                        sortScores.get(word + index).score += score.score.reduce((a, b) => a + b, 0);
                    } else {
                        sortScores.set(word + index, {word: word, index: index, score: score.score.reduce((a, b) => a + b, 0)});
                    }
                }
            }
            return sortScores;
        }
        let videoWordScores = addScores(wordScores.current);
        let videoFrameScores = addScores(frameScores.current);
        let videoDefinitionScores = addScores(definitionScores.current);

        let sortScores = new Map();

        for (let [key, value] of videoWordScores) {
            if (sortScores.has(key)) {
                sortScores.get(key).score += value.score;
            } else {
                sortScores.set(key, {word: value.word, index: value.index, score: value.score});
            }
        }

        for (let [key, value] of videoDefinitionScores) {
            if (sortScores.has(key)) {
                sortScores.get(key).score += value.score;
            } else {
                sortScores.set(key, {word: value.word, index: value.index, score: value.score});
            }
        }
        
        if (ifRecord.current) {
            let scoresRecordBackup = {wordScores: [...wordScores.current], frameScores: [...frameScores.current], definitionScores: [...definitionScores.current]}
            let dataBackUp = {eyeData: [...eyeGazeRecordData.current], definitionData: definitionToggle.current ? [...definitionRecordData.current] : ["No definitions"], scoresData: {...scoresRecordBackup}};
            
            let eyeData = dataBackUp.eyeData;
            let questionData = dataBackUp.questionData;
            let definitionData = dataBackUp.definitionData;
            let scoresData = dataBackUp.scoresData;

            function findDuplicateDirectory(directory, extension) {
                let duplicateNum = 1;
                let dir = "./data/backup/(" + duplicateNum + ") " + directory + "." + extension;
                
                while (fs.existsSync(dir)) {
                    duplicateNum++;
                    dir = "./data/backup/(" + duplicateNum + ") " + directory + "." + extension;
                }
                return dir;
            }

            if (eyeData.length > 0 || questionData.length > 0 || definitionData.length > 0 || scoresData.length > 0) {
                let eyeDataDirectory = findDuplicateDirectory("eyeData", "csv");
                let definitionDataDirectory = findDuplicateDirectory("definitionData", "json");
                let scoresDataDirectory = findDuplicateDirectory("scoresData", "json");

                fs.mkdirSync("./data/backup", { recursive: true });
                let csv = eyeData[0].xOffset + " " + eyeData[0].yOffset;

                let sliceEyeData = eyeData.slice(1, eyeData.length);

                for (let i = 0; i < sliceEyeData.length; i++) {
                    if (sliceEyeData[i].message) {
                        csv += "\n" + sliceEyeData[i].message + " " + sliceEyeData[i].timestamp;
                        sliceEyeData.splice(i, 1);
                        i--;
                    } else {
                        break;
                    }
                }
                csv += "\nx, y, dt, index, headDistance, radius, timestamp\n";

                sliceEyeData.forEach((row) => {
                    csv += row.x + ", " + row.y + ", " + row.dt + ", " + row.index + ", " + row.headDistance + ", " + row.radius + ", " + row.timestamp + "\n";
                });
                fs.writeFileSync(eyeDataDirectory, csv);
                fs.writeFileSync(definitionDataDirectory, JSON.stringify(definitionData, replacer));
                fs.writeFileSync(scoresDataDirectory, JSON.stringify(scoresData, replacer));
            }
        }
        
        function getTopWords(sortScores) {
            let subtitleScores = new Map();

            for (let [key, value] of sortScores) {
                let index = value.index;
                let score = value.score;
                
                if (index < 0 || index >= rawCaptions.current.length) {
                    continue;
                }

                if (subtitleScores.has(index)) {
                    subtitleScores.get(index).score += score;
                } else {
                    subtitleScores.set(index, {score: score});
                }
            }

            for (let [key, value] of subtitleScores) {
                let index = key;
                let score = value.score;
                let startTime = rawCaptions.current[index].data.start;
                let endTime = rawCaptions.current[index].data.end;
                let duration = endTime - startTime;

                subtitleScores.set(index, {score: score / duration});
            }
            
            let topSubtitles = [...subtitleScores.entries()];
            topSubtitles.sort((a, b) => b[1].score - a[1].score);

            let topWordsFromSubtitles = new Map();

            for (let i = 0; i < topSubtitles.length; i++) {
                let index = topSubtitles[i][0];
                
                for (let [word, scores] of sortScores) {
                    if (scores.index === index) {
                        if (topWordsFromSubtitles.has(index) && topWordsFromSubtitles.get(index).score < scores.score) {
                            topWordsFromSubtitles.set(index, {...scores});
                        } else if (!topWordsFromSubtitles.has(index)) {
                            topWordsFromSubtitles.set(index, {...scores});
                        }
                    }
                }
            }
            return topWordsFromSubtitles;
        }
        let topWords = [...getTopWords(sortScores).entries()];
        
        function getQuestionData(topWords, secondRun = false) {
            let questionData = [];
            let questionIndex = new Set();
            let questionTime = new Set();
    
            for (let i = 0; i < topWords.length; i++) {
                let word = topWords[i][1];
    
                if (questionIndex.has(word.index)) {
                    continue;
                }
    
                for (let time of questionTime) {
                    if (Math.abs(time - rawCaptions.current[word.index].data.start) < 6000) {
                        continue;
                    }
                }
                questionIndex.add(word.index);
                questionTime.add(rawCaptions.current[word.index].data.start);
    
                let subtitle = rawCaptions.current[word.index].data.text.replace(/(?:\r\n|\r|\n)/g, ' ');
                let startTime = rawCaptions.current[word.index].data.start;
                let endTime = rawCaptions.current[word.index].data.end;
                let startAllTime = rawCaptions.current[word.index].data.start;
                let endAllTime = rawCaptions.current[word.index].data.end;
                
                for (let i = word.index - 1; i >= 0; i--) {
                    subtitle = rawCaptions.current[i].data.text.replace(/(?:\r\n|\r|\n)/g, ' ') + " " + subtitle;
                    startAllTime = rawCaptions.current[i].data.end + 10;
    
                    if (startTime - startAllTime > 5000) {
                        startAllTime = rawCaptions.current[i].data.start;
                        break;
                    }
                }
                
                for (let i = word.index + 1; i < rawCaptions.current.length; i++) {
                    subtitle += rawCaptions.current[i].data.text.replace(/(?:\r\n|\r|\n)/g, ' ') + " ";
                    endAllTime = rawCaptions.current[i].data.start - 10;
    
                    if (endAllTime - endTime > 5000) {
                        endAllTime = rawCaptions.current[i].data.end + 10;
                        break;
                    }
                }
    
                let collocation = word.word;
                questionData.push({subtitle: subtitle, collocation: collocation, startTime: startAllTime, endTime: endAllTime, secondRun: secondRun});
    
                if (questionData.length === 5 || (i === topWords.length - 1 && questionTime.size === 0)) {
                    break;
                }
    
                if (i === topWords.length - 1 && questionData.length <= 4) {
                    i = 0;
                    questionTime.clear();
                }
            }
            return questionData;
        }
        let questions = [];
        let questionData = getQuestionData(topWords);

        if (questionData.length < 5) {
            for (let [key, value] of videoFrameScores) {
                if (sortScores.has(key)) {
                    sortScores.get(key).score += value.score;
                } else {
                    sortScores.set(key, {word: value.word, index: value.index, score: value.score});
                }
            }
            topWords = [...getTopWords(sortScores).entries()];

            let newQuestionData = getQuestionData(topWords, true);

            newData: for (let i = 0; i < newQuestionData.length; i++) {
                for (let j = 0; j < questionData.length; j++) {
                    if (newQuestionData[i].startTime === questionData[j].startTime &&
                        newQuestionData[i].endTime === questionData[j].endTime &&
                        newQuestionData[i].subtitle === questionData[j].subtitle &&
                        newQuestionData[i].collocation === questionData[j].collocation
                    ) {
                        continue newData;
                    }
                }
                questionData.push(newQuestionData[i]);

                if (questionData.length === 5) {
                    break;
                }
            }
        }

        if (llmRef.current) {
            if (questionData.length === 0) {
                questionEndCallback();
                setQuestion([]);
                return;
            }
            let promises = [];

            for (let i = 0; i < questionData.length; i++) {
                let subtitle = questionData[i].subtitle;
                let collocation = questionData[i].collocation;

                promises.push(
                    generateQuestion(subtitle, collocation)
                    .then(qData => {
                        qData.subtitle = subtitle;
                        qData.startTime = questionData[i].startTime / 1000;
                        qData.endTime = questionData[i].endTime / 1000;
                        qData.collocation = collocation;
                        qData.secondRun = questionData[i].secondRun;

                        questions.push(qData);
                    })
                );

            }
            let p = Promise.all(promises);

            toast.promise(
                p,
                {
                  pending: "One second please...",
                  success: 'Please answer the following questions',
                },
                {
                    position: "bottom-center",
                    autoClose: 5000,
                    closeOnClick: false,
                    pauseOnHover: true,
                    draggable: false,
                    theme: "dark",
                    toastId: "questionToast",
                    style: {userSelect: "none"}
                }
            );
            await p;
            questions.sort((a, b) => JSON.stringify(a).length - JSON.stringify(b).length);
        } else {
            questions = Object.values(JSON.parse(JSON.stringify(questionsRef.current)).default);

            for (let question of questions) {
                let choiceA = question.choiceA;
                let choiceB = question.choiceB;
                let choiceC = question.choiceC;
                let choiceD = question.choiceD;
                let answer;

                switch (question.answer) {
                    case "A":
                        answer = choiceA;
                        break;
                    case "B":
                        answer = choiceB;
                        break;
                    case "C":
                        answer = choiceC;
                        break;
                    case "D":
                        answer = choiceD;
                        break;
                }
                let choices = [
                    { choice: choiceA, explanation: question.explanation.A },
                    { choice: choiceB, explanation: question.explanation.B },
                    { choice: choiceC, explanation: question.explanation.C },
                    { choice: choiceD, explanation: question.explanation.D }
                ];
                let shuffled = shuffle(choices);
                
                let newChoices = shuffled.next().value; 
                question.choiceA = newChoices.choice;
                question.explanation.A = newChoices.explanation.replace(/Option "?[A-D]"?/g, "Option A");

                newChoices = shuffled.next().value;
                question.choiceB = newChoices.choice;
                question.explanation.B = newChoices.explanation.replace(/Option "?[A-D]"?/g, "Option B");

                newChoices = shuffled.next().value;
                question.choiceC = newChoices.choice;
                question.explanation.C = newChoices.explanation.replace(/Option "?[A-D]"?/g, "Option C");

                newChoices = shuffled.next().value;
                question.choiceD = newChoices.choice;
                question.explanation.D = newChoices.explanation.replace(/Option "?[A-D]"?/g, "Option D");
                
                switch (answer) {
                    case question.choiceA:
                        question.answer = "A";
                        break;
                    case question.choiceB:
                        question.answer = "B";
                        break;
                    case question.choiceC:
                        question.answer = "C";
                        break;
                    case question.choiceD:
                        question.answer = "D";
                        break;
                }
            }
            let p = new Promise((resolve, reject) => {
                setTimeout(() => {
                    resolve();
                }, 25000);
            });

            toast.promise(
                p,
                {
                  pending: "One second please...",
                  success: 'Please answer the following questions',
                },
                {
                    position: "bottom-center",
                    autoClose: 5000,
                    closeOnClick: false,
                    pauseOnHover: true,
                    draggable: false,
                    theme: "dark",
                    toastId: "questionToast",
                    style: {userSelect: "none"}
                }
            );
            await p;
            questions = [...shuffle(questions)];
        }
        setShowDefinitionContainer(false);
        
        d3.select("#video")
        .transition()
        .duration(1000)
        .styleTween("transform", () => d3.interpolate(d3.select("#video").style("transform"), "translateX(0%)"))
        .on("end", () => {
            setShowMoreInfo(false);
            setShowDefinition(null);
            setQuestion(questions);

            if (ifRecord.current) {
                eyeGazeRecordData.current.splice(1, 0, {timestamp: Date.now(), message: "QuestionStart"});
            }
        });
    };

    let resetCallback = () => {
        wordScores.current.clear();
        frameScores.current.clear();
        definitionScores.current.clear();
        onQuestions.current = false;
        setQuestion([]);
    };

    let questionCallback = (questionData, submittedAnswer) => {
        if (ifRecord.current || fileUploadRef.current) {
            questionRecordData.current.push({question: questionData, submittedAnswer: submittedAnswer});
        }
    }

    let questionEndCallback = () => {
        forcePauseRef.current = true;
        onQuestions.current = false;
        fileUploadRef.current = false;

        if (definitionToggle.current == false) {
            d3.select("#video")
            .transition()
            .duration(1000)
            .styleTween("transform", () => d3.interpolate(d3.select("#video").style("transform"), "translateX(-15%)"))

            setShowDefinitionContainer(true);
        }

        if (endCallbackRef.current instanceof Function) {
            endCallbackRef.current();
        }

        if (!ifRecord.current) {
            let player = videojs.getAllPlayers()[0];

            if (player)
                player.trigger("reset");
        }
    };

    let clickCallback = (ifPaused) => {
        forcePauseRef.current = ifPaused;

        if (!ifPaused) {
            end.current = false;
            setPaused(false);
        }
    };
    
    let trim = (start, end) => {
        let src = videojs("video").src().split("#")[0];

        setSrc(src + "#t=" + start + "," + end);
        videojs("video").load();
    };

    let definitionCallbackFunc = (collocation, definition, element, type) => {
        definitionRecordData.current.push({collocation: collocation, definition: definition, element: element, type: type, timestamp: new Date().getTime() });
    };

    useEffect(() => {
        fetch(track)
        .then(response => response.text())
        .then(async data => {
            rawCaptions.current = parseSync(data).filter(n => n.type === "cue");
        });
    }, [track]);

    useEffect(() => {
        pauseRef.current = paused;
    }, [paused]);

    useEffect(() => {
        complexityMap.current = JSON.parse(JSON.stringify(complexityData), reviver);
    }, [complexityData]);

    useEffect(() => {
        phrases.current = JSON.parse(JSON.stringify(phraseDefinitions), reviver);
    }, [phraseDefinitions]);

    useEffect(() => {
        llmRef.current = llm;
    }, [llm]);

    useEffect(() => {
        questionsRef.current = questions;
    }, [questions]);

    useEffect(() => {
        ifRecord.current = record;

        if (!record && eyeGazeRecordData.current.length > 0) {
            scoresRecordData.current = {wordScores: [...wordScores.current], frameScores: [...frameScores.current], definitionScores: [...definitionScores.current]}
            
            if (recordCallback instanceof Function)
                recordCallback(src, {eyeData: [...eyeGazeRecordData.current], questionData: [...questionRecordData.current], definitionData: definitionToggle.current ? [...definitionRecordData.current] : ["No definitions"], scoresData: {...scoresRecordData.current}});
            
            eyeGazeRecordData.current = [];
            questionRecordData.current = [];
            definitionRecordData.current = [];
            scoresRecordData.current = {};
        }
    }, [record, recordCallback, src]);

    useEffect(() => {
        setDefinitionCallbackState(() => (collocation, definition, element, type) => {
            if (ifRecord.current)
                definitionCallbackFunc(collocation, definition, element, type);

            if (definitionCallback instanceof Function)
                definitionCallback(collocation, definition, element, type);
        });
    }, [definitionCallback]);
    
    useEffect(() => {
        setSrc(srcInit);
        setTrack(trackInit);
    }, [srcInit, trackInit]);

    useEffect(() => {
        if (showDefinitions) {
            definitionToggle.current = toggleDefinitions;
            setShowDefinitionContainer(!definitionToggle.current);
        } else {
            definitionToggle.current = null;
            setShowDefinitionContainer(false);
        }
    }, [toggleDefinitions, showDefinitions]);

    useEffect(() => {
        if (definitionContainerCallback instanceof Function) {
            definitionContainerCallback(showDefinitionContainer)
        }
    }, [definitionContainerCallback, showDefinitionContainer]);

    useEffect(() => {
        endCallbackRef.current = endCallback;
    }, [endCallback]);

    useEffect(() => {
        if (forcePause)
            forcePauseRef.current = forcePause;
    }, [forcePause]);

    let fail = useRef(true);

    useEffect(() => {
        if (!showDefinitions) {
            setTextTrackChangeCallback(null);
            setResizeCallback(null);

            let highlightNodes = d3.selectAll("span.highlight").nodes();
            
            for (let highlightNode of highlightNodes) {
                let parent = highlightNode.parentElement;
                let children = [...highlightNode.childNodes];
                
                for (let child of children) {
                    parent.insertBefore(child, highlightNode);
                }
                parent.removeChild(highlightNode);
            }
            d3.selectAll("span.highlight").classed("highlight", false);
            return;
        } else if (!collocations) {
            return;
        }
        let collocationValues = [...collocations.values()];
        fail.current = true;

        let callback = () => {
            if (!fail.current)
                return;
                
            let f = false;
            let subtitleNodesArray = [];

            for (let d of collocationValues) {
                let collocation = d.collocation;
                let index = 0;
                let subtitleNodes = new Set();
                let tSubtitleNodes = new Set();
                let addLength = 0;
                let wordContainer = d3.select(".vjs-text-track-cue").select("div");
                let wordNodes = wordContainer.selectAll("span").nodes().filter(d => !d.classList.contains("highlight") && !d.classList.contains("copyCollocation"));
                let hypenCount = -1;
                let containsHighlight = false;

                for (let i = 0; i < wordNodes.length; i++) {
                    let text = wordNodes[i];

                    if (text.innerText.trim() !== "") {
                        let innerText = text.innerText.toLowerCase();
                        
                        if (innerText.includes(collocation[index])) {
                            if (innerText.includes("-")) {
                                let splitHypen = innerText.split("-");
                                let textIndex = splitHypen.indexOf(collocation[index]);
                                
                                if (hypenCount < 0 || hypenCount + 1 === textIndex) {
                                    hypenCount = textIndex;
                                    subtitleNodes.add(text);
                                    index++;

                                    if (text.parentElement.classList.contains("highlight")) {
                                        containsHighlight = true;
                                    }

                                    if (subtitleNodes.size - addLength === collocation.length) {
                                        if (containsHighlight) {
                                            tSubtitleNodes = new Set([...subtitleNodes]);
                                            subtitleNodes.clear();
                                            index = 0;
                                            addLength = 0;
                                            hypenCount = -1;
                                            continue;
                                        } else {
                                            break;
                                        }
                                    } else if (hypenCount !== splitHypen.length - 1) {
                                        addLength--;
                                        i--;
                                        continue;
                                    }
                                    
                                } else {
                                    subtitleNodes.clear();
                                    index = 0;
                                    addLength = 0;
                                    hypenCount = -1;
                                }
                            } else if (innerText.startsWith(collocation[index]) || innerText.endsWith(collocation[index])) {
                                subtitleNodes.add(text);
                                index++;
                                hypenCount = -1;

                                if (text.parentElement.classList.contains("highlight")) {
                                    containsHighlight = true;
                                }
                            }
                        } else {
                            subtitleNodes.clear();
                            index = 0;
                            addLength = 0;

                            if (innerText.startsWith(collocation[0]) || innerText.endsWith(collocation[0]))
                                i--;
                        }

                        if (subtitleNodes.size - addLength === collocation.length) {
                            if (containsHighlight) {
                                tSubtitleNodes = new Set([...subtitleNodes]);
                                subtitleNodes.clear();
                                index = 0;
                                addLength = 0;
                                hypenCount = -1;
                            } else {
                                break;
                            }
                        }
                    } else if (subtitleNodes.size > 0) {
                        subtitleNodes.add(text);

                        if (text.parentElement.classList.contains("highlight")) {
                            containsHighlight = true;
                        }
                        addLength++;
                    }
                }

                if (subtitleNodes.size > 0 || tSubtitleNodes.size > 0) {
                    let optimalSubtitleNodes = subtitleNodes.size > 0 ? subtitleNodes : tSubtitleNodes;

                    subtitleNodesArray.push(optimalSubtitleNodes);
                    let subtitleArray = [...optimalSubtitleNodes];
                    let firstNode = subtitleArray[0];
                    let collocationContainer = document.createElement("span");

                    if (!firstNode.parentElement.classList.contains("highlight")) {
                        try {
                            wordContainer.node()
                            .insertBefore(collocationContainer, firstNode)
                        } catch (e) {
                            console.log(e);
                        }
                    } else {
                        collocationContainer = firstNode.parentElement;
                    }
                    let hasHighlight = false;
                    
                    for (let subtitleNode of optimalSubtitleNodes) {
                        if (subtitleNode.parentElement.classList.contains("highlight")) {
                            hasHighlight = true;
                            continue;
                        }

                        if (hasHighlight) {
                            d3.select(collocationContainer)
                            .html(d3.select(collocationContainer).html() + " ");
                        }
                        d3.select(collocationContainer)
                        .classed("highlight", true)
                        .append(() => d3.select(subtitleNode).clone(true).node());

                        d3.select(subtitleNode).classed("copyCollocation", true);

                        d3.select(collocationContainer)
                        .html(d3.select(collocationContainer).html() + " ");
                    }
                    
                    d3.select(collocationContainer)
                    .html(d3.select(collocationContainer).html().slice(0, -1));
                } else {
                    f = true;
                    break;
                }
            };

            if (f) {
                d3.selectAll(".highlight").remove();
                d3.selectAll(".copyCollocation").classed("copyCollocation", false);
            } else {
                d3.selectAll(".copyCollocation").remove();
            }
            fail.current = f;
        }
        
        setTextTrackChangeCallback(() => callback);
        setResizeCallback(() => () => {
            fail.current = true;
            callback();
        });
        callback();
    }, [collocations, showDefinitions]);

    let names = useRef(new Set());

    useEffect(() => {
        names.current = new Set();

        for (let [collocation, definition] of phrases.current) {
            let regex = /【\d+†source】/;

            if (regex.test(definition.definitionPhrase.definition)) {
                definition.definitionPhrase.definition = definition.definitionPhrase.definition.replace(regex, "");
            }

            for (let i = 1; "definitionTerm" + i in definition; i++) {
                if (regex.test(definition["definitionTerm" + i].definition)) {
                    definition["definitionTerm" + i].definition = definition["definitionTerm" + i].definition.replace(regex, "");
                }

                if ((
                    definition["definitionTerm" + i].definition.includes("given name") ||
                    definition["definitionTerm" + i].definition.includes("common name") ||
                    definition["definitionTerm" + i].definition.includes("common male name") ||
                    definition["definitionTerm" + i].definition.includes("common female name") ||
                    definition["definitionTerm" + i].definition.includes("person's name") ||
                    definition["definitionTerm" + i].definition.includes("people's name") ||
                    definition["definitionTerm" + i].definition.includes("person named") ||
                    definition["definitionTerm" + i].definition.includes("someone named") ||
                    definition["definitionTerm" + i].definition.includes("name of a person") ||
                    definition["definitionTerm" + i].definition.includes("person with the name") ||
                    definition["definitionTerm" + i].definition.includes("last name") ||
                    definition["definitionTerm" + i].definition.includes("first name") ||
                    definition["definitionTerm" + i].definition.includes("surname"))
                ) {
                    if (definition["definitionTerm" + i].term.length > 2) {
                        names.current.add(definition["definitionTerm" + i].term.toLowerCase());
                    }
                }
            }
        }
        
        loop: for (let [collocation, definition] of phrases.current) {
            for (let i = 1; "definitionTerm" + i in definition; i++) {
                if (
                    !collocation.toLowerCase().includes(definition["definitionTerm" + i].term.toLowerCase())
                ) {
                    definition["definitionTerm" + i].term = "";
                    definition["definitionTerm" + i].definition = "";
                }
            }
            
            if (definition.definitionPhrase.definition.toLowerCase().replace("’", "'").includes(collocation.replace("’", "'").toLowerCase())) {
                let startIndex = definition.definitionPhrase.definition.toLowerCase().replace("’", "'").search(collocation.replace("’", "'").toLowerCase());
                let commaIndex = definition.definitionPhrase.definition.toLowerCase().replace("’", "'").search(",");
                let originalDefinition = definition.definitionPhrase.definition;

                if (commaIndex > -1 && commaIndex < startIndex && commaIndex < definition.definitionPhrase.definition.length / 2) {
                    startIndex = commaIndex + 1;
                } else {
                    startIndex += collocation.length;
                }

                if (startIndex < definition.definitionPhrase.definition.length / 2) {
                    definition.definitionPhrase.definition = definition.definitionPhrase.definition.slice(startIndex).trim();
                    definition.definitionPhrase.definition.split(" ")[0].search(/[a-zA-Z]/) === -1 ? definition.definitionPhrase.definition = definition.definitionPhrase.definition.slice(definition.definitionPhrase.definition.split(" ")[0].length).trim() : null;
                }

                if (definition.definitionPhrase.definition == "") {
                    definition.definitionPhrase.definition = originalDefinition
                }
            }

            if (definition.definitionPhrase.definition.toLowerCase().replace("’", "'").includes("phrase")) {
                let startIndex = definition.definitionPhrase.definition.toLowerCase().replace("’", "'").search("phrase");

                if (startIndex < definition.definitionPhrase.definition.length / 4) {
                    definition.definitionPhrase.definition = definition.definitionPhrase.definition.slice(startIndex + "phrase".length).trim();
                    definition.definitionPhrase.definition.split(" ")[0].search(/[a-zA-Z]/) === -1 ? definition.definitionPhrase.definition = definition.definitionPhrase.definition.slice(definition.definitionPhrase.definition.split(" ")[0].length).trim() : null;
                }
            }

            for (let name of names.current) {
                let c = phrases.current.get(collocation);
                if (
                    (definition.definitionTerm1.term.toLowerCase().includes(name) ||
                    definition.definitionPhrase.phrase.toLowerCase().includes(name) ||
                    definition.definitionTerm2.term.toLowerCase().includes(name)) &&
                    (c.definitionPhrase.definition.toLowerCase().includes("person named") ||
                    c.definitionPhrase.definition.toLowerCase().includes("person with the name") ||
                    c.definitionPhrase.definition.toLowerCase().includes("name of a person") ||
                    c.definitionPhrase.definition.toLowerCase().includes("given the name") ||
                    c.definitionPhrase.definition.toLowerCase().includes("given the specific name") ||
                    c.definitionPhrase.definition.toLowerCase().includes("person's name") ||
                    c.definitionPhrase.definition.toLowerCase().includes("someone named") ||
                    c.definitionPhrase.definition.toLowerCase().includes("people's name") ||
                    c.definitionPhrase.definition.toLowerCase().includes("given name") ||
                    c.definitionPhrase.definition.toLowerCase().includes("names") ||
                    c.definitionPhrase.definition.toLowerCase().includes("surname") ||
                    c.definitionPhrase.definition.toLowerCase().includes("last name") ||
                    c.definitionPhrase.definition.toLowerCase().includes("first name") ||
                    c.definitionPhrase.definition.toLowerCase().includes(name))
                ) {
                    continue loop;
                }
            }

            for (let i = 1; "definitionTerm" + i in definition; i++) {
                additionalPhrases.current.set(definition["definitionTerm" + i].term, { definitionPhrase: {phrase: definition["definitionTerm" + i].term, definition: definition["definitionTerm" + i].definition}});
            }
        }
    }, [phraseDefinitions]);

    let oneeuroX = useRef(new OneEuroFilter(1 / 33, 0.0008, 0.001, 1));
    let oneeuroY = useRef(new OneEuroFilter(1 / 33, 0.0008, 0.001, 1));
    let rbfchain = useRef(new RBFChain(0.01, 0.95, 0.175, 1.0));
    let rbfchainFrame = useRef(new RBFChain(0.01, 0.95, 0.665, 1.0));
    let lastTime = useRef(null), currentTime = useRef(null), dt = useRef(null);
    let timeout = useRef(null);
    
    useEffect(() => {
        let addScores = (map, word, score, i) => {
            if (map.has(word)) {
                if (map.get(word).has(i)) {
                    map.get(word).get(i).score.push(score)
                    map.get(word).get(i).dt.push(dt.current)
                } else {
                    map.get(word).set(i, {score: [score], dt: [dt.current]});
                }
            } else {
                map.set(word, new Map().set(i, {score: [score], dt: [dt.current]}));
            }
        }

        let test = (event, arg) => {
            currentTime.current = new Date().getTime();

            if (lastTime.current)
                dt.current = currentTime.current - lastTime.current;

            if (dt.current) {
                let xOffset = new Number(d3.select("#gazeCursor").attr("xoffset"));
                let yOffset = new Number(d3.select("#gazeCursor").attr("yoffset"));
                let x = oneeuroX.current.filter(arg.x + xOffset, currentTime.current);
                let y = oneeuroY.current.filter(arg.y + yOffset, currentTime.current);
                let nodes = d3.selectAll(".vjs-text-track-cue div span").nodes().filter(d => !d.classList.contains("highlight") && !d.classList.contains("copyCollocation"));
                let userCenterRadius = headDistancesRef.current * Math.tan(4 * Math.PI/180) * 0.393701 * 127 / 2;

                if (x && y) {
                    let input_data = Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
                    let probability = rbfchain.current.add_element(input_data);
                    let is_fixation = probability >= rbfchain.current.delta;
                    let probabilityFrame = rbfchainFrame.current.add_element(input_data);
                    let is_fixationFrame = probabilityFrame >= rbfchainFrame.current.delta;

                    if (ifRecord.current) {
                        if (eyeGazeRecordData.current.length === 0) {
                            eyeGazeRecordData.current.push({xOffset: xOffset, yOffset: yOffset});
                        }
                        let player = videojs.getAllPlayers()[0];
                        let playerTime = player ? player.currentTime() : -1;
                        eyeGazeRecordData.current.push({x: x, y: y, timestamp: currentTime.current, index: index.current, dt: dt.current, headDistance: headDistancesRef.current, radius: userCenterRadius, playerTime: playerTime, is_fixation: is_fixation, is_fixationFrame: is_fixationFrame});
                    }

                    d3.select("#gazeCursor")
                    .style("width", userCenterRadius * 2 + "px")
                    .style("height", userCenterRadius * 2 + "px")
                    .style("transform", "translate(" + (x  - userCenterRadius) + "px, " + (y - userCenterRadius) + "px)");
                    
                    if (is_fixationFrame) {
                        let definitions = d3.selectAll("#definitionsContainer .collocation").nodes();
                        let circle = {x: x, y: y, r: 5};
                        let definitionContainer = null;

                        for (let definition of definitions) {
                            let definitionBBox = definition.getBoundingClientRect();

                            if (rectCircleColliding(circle, definitionBBox)) {
                                definitionContainer = definition;
                                break;
                            }
                        }

                        if (definitionContainer && d3.select(definitionContainer).select("span").style("max-height").startsWith("0")) {
                            setShowDefinition(d3.select(definitionContainer).attr("collocation"));
                        } else {
                            setShowDefinition(null);
                        }
                        setShowMoreInfo(false);
                        setOnPrev(false);
                        definitions = d3.selectAll("#definitionsContainer .collocationInfo").nodes();

                        for (let definition of definitions) {
                            let definitionBBox = definition.getBoundingClientRect();

                            if (rectCircleColliding(circle, definitionBBox)) {
                                definitionContainer = definition;
                                break;
                            }
                        }

                        if (definitionContainer) {
                            let definitionInterest = d3.select(definitionContainer).attr("collocation");
                            let words = JSON.parse(definitionInterest);

                            if (words instanceof Array) {
                                for (let word of words) {
                                    if (complexityMap.current.has(word)) {
                                        let score = (1 / words.length) * Math.sqrt(dt.current) * (complexityMap.current.get(word) / 5) * 1000;
                                        addScores(definitionScores.current, word, score, delayIndex.current);
                                    }
                                }
                            }
                        }
                        let moreInfobbox = d3.select("#moreInfo").node().getBoundingClientRect();
                        let prevBBox = d3.select("#prev").node().getBoundingClientRect();

                        if (ptInCircle({x: x, y: y, r: userCenterRadius}, {x: moreInfobbox.x + moreInfobbox.width / 2, y: moreInfobbox.y + moreInfobbox.height / 2, r: moreInfobbox.width / 2}) <= 0) {
                            setShowMoreInfo(true);
                            setOnPrev(false);
                        } else if (ptInCircle({x: x, y: y, r: userCenterRadius * 2}, {x: prevBBox.x + prevBBox.width / 2, y: prevBBox.y + prevBBox.height / 2, r: prevBBox.width / 2}) <= 0) {
                            setOnPrev(true);
                            setShowMoreInfo(false);
                        }
                    }

                    if (is_fixation || is_fixationFrame) {
                        if (is_fixation)
                            d3.select("#fixationCursor")
                            .style("width", userCenterRadius * 2 + "px")
                            .style("height", userCenterRadius * 2 + "px")
                            .style("transform", "translate(" + (x  - userCenterRadius) + "px, " + (y - userCenterRadius) + "px)");

                        if (index.current > -1) {
                            let circle = {x: x, y: y, r: userCenterRadius};
                            
                            let player = d3.select("video").node();
                            let playerBBox = player.getBoundingClientRect();
                            let playerArea = playerBBox.x <= x && x <= playerBBox.x + playerBBox.width && playerBBox.y <= y && y <= playerBBox.y + playerBBox.height;
                            let wordsInGaze = 0;

                            for (let wordNode of nodes) {
                                let text = tokenize.extract(d3.select(wordNode).text(), { toLowercase: true, regex: [tokenize.words] });

                                if (text instanceof Array) {
                                    for (let word of text) {
                                        if (complexityMap.current.has(word) && rectCircleColliding(circle, wordNode.getBoundingClientRect())) {
                                            wordsInGaze++;
                                        }
                                    }
                                }
                            }

                            for (let wordNode of nodes) {
                                d3.select(wordNode).style("background-color", null);
                                let wordBbox = wordNode.getBoundingClientRect();
                                let text = tokenize.extract(d3.select(wordNode).text(), { toLowercase: true, regex: [tokenize.words] });

                                if (text instanceof Array && playerArea && is_fixationFrame) {
                                    for (let word of text) { 
                                        if (complexityMap.current.has(word)) {
                                            let frameScore = (Math.log10(nodes.length) + 1) * Math.sqrt(dt.current) * (complexityMap.current.get(word) / 5) * 1000;
                                            addScores(frameScores.current, word, frameScore, index.current);
                                        }
                                    }
                                }
                                
                                if (text instanceof Array && is_fixation && rectCircleColliding(circle, wordBbox)) {
                                    let d = Math.pow(wordBbox.x + wordBbox.width / 2 - circle.x, 2) + Math.pow(wordBbox.y + wordBbox.height / 2 - circle.y, 2);

                                    for (let word of text) {                                    
                                        if (complexityMap.current.has(word)) {
                                            let score = (1 / wordsInGaze) * Math.sqrt(dt.current) * (1 / (d + 1)) * (complexityMap.current.get(word) / 5) * 1000;
                                            addScores(wordScores.current, word, score, index.current);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    let definitionsContainer = d3.select("#definitionsContainer").node();
                    let definitionsBBox = definitionsContainer.getBoundingClientRect();
                    let inAreaOfInterest = !(window.innerWidth * 0.95 <= x || definitionsBBox.x <= x);

                    if (!end.current && !onQuestions.current && showDefinitions) {
                        if (inAreaOfInterest && document.hasFocus() && pauseRef && !forcePauseRef.current) {
                            if (!timeout.current) {
                                timeout.current = setTimeout(() => {
                                    let caption = rawCaptions.current[index.current];

                                    if (definitionToggle.current)
                                        setShowDefinitionContainer(false);
                                    setShowMoreInfo(false);
        
                                    if (caption) {
                                        let startTime = caption.data.start / 1000;
                                        setVideoTime(startTime);
                                    } else {
                                        setVideoTime(-1);
                                    }
                                    setPaused(false);
                                    timeout.current = null;
                                }, 500);
                            }
                        } else if ((!inAreaOfInterest || !document.hasFocus()) || (forcePauseRef.current)) {
                            clearTimeout(timeout.current);
                            timeout.current = null;
                            setPaused(true);
    
                            if (document.hasFocus() && !inAreaOfInterest) {
                                if (definitionToggle.current)
                                    setShowDefinitionContainer(true);
                            } else {
                                if (definitionToggle.current)
                                    setShowDefinitionContainer(false);
                                setShowMoreInfo(false);
                            }
                        }
                    }
                } else {
                    clearInterval(timeout.current);
                    timeout.current = null;
                    setPaused(true);
                }
            }
            lastTime.current = currentTime.current;
        }
        let mouseInterval;

        if (!mouseEnabled) {
            ipcRenderer.on('gaze-pos', (e, a) => {
                let args = a;

                args.y -= (screen.height - document.documentElement.clientHeight);
                args.x -= window.screenLeft
                args.y -= window.screenTop 
                test(e, args);
            });

            ipcRenderer.on("head-pos", (e, a) => {
                headDistancesRef.current = a.z / 10;
            });
        } else {
            document.addEventListener("mousemove", (e) => {
                x.current = e.clientX;
                y.current = e.clientY;
            });

            mouseInterval = setInterval(() => {
                test(null, {x: x.current, y: y.current});
            }, 1000 / 33);
        }

        return () => {
            clearInterval(timeout.current);
            clearInterval(mouseInterval);
            timeout.current = null;
            ipcRenderer.removeAllListeners();
            d3.select(document).on("mousemove", null);
        }
    }, [mouseEnabled, showDefinitions]);

    return (
        <>
            <div id={"container"}>
                <Player 
                    clickCallback={clickCallback}
                    timerCallback={timerCallback}
                    textTrackChangeCallback={textTrackChangeCallback}
                    resizeCallback={resizeCallback}
                    endCallback={playerEndCallback}
                    paused={paused}
                    time={videoTime}
                    src={src}
                    track={track}
                    toggleDefinitions={toggleDefinitions}
                    resetCallback={resetCallback}
                />

                <QuestionForm questionData={questionData} questionCallback={questionCallback} endCallback={questionEndCallback} reviewCallback={trim} />
            </div>
            
            <DefinitionsContainer collocations={collocations} show={showDefinitionContainer} showDefinition={showDefinition} showMoreInfo={showMoreInfo} onPrev={onPrev} definitionCallback={definitionCallbackState} />
        </>
    );
}
