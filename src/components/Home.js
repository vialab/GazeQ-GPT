import React, { useRef } from "react";
import { useEffect, useState } from 'react';
import * as d3 from "d3";   
import RBFChain from "../js/RBFChain";
import { parseSync } from 'subtitle';
import h337 from 'heatmap.js';
import * as tokenize from 'words-n-numbers';
import { removeStopwords } from 'stopword';
import JSON5 from 'json5';
import { ipcRenderer } from "electron";
import { generateQuestion, getComplexity, getPhrase, parsePhrase } from "../js/OpenAIUtils";
import OneEuroFilter from "../js/oneeuro.js";
import { ToastContainer, toast, Flip } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.min.css';
import "../assets/css/Home.css";

import Player from "./Player";
import QuestionForm from "./QuestionForm";
import videojs from "video.js";
import DefinitionsContainer from "./DefinitionsContainer";

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
            value: Array.from(value.entries()), // or with spread: value: [...value]
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
            // console.log(phrase[0]);
            // console.log(phrases.has(phrase[0]))
            // console.log(text.toLowerCase().replace(/(?:\r\n|\r|\n)/g, ' ').replace("-", " ").includes(phrase[0]))
            let complexity = wordPhrase.map(word => complexityMap.get(word) || 0).reduce((a, b) => a + b, 0) / wordPhrase.length;

            if (phrase[0] !== text.toLowerCase() && (phrases.has(phrase[0]) || (secondary && additionalPhrases.has(phrase[0]))) && text.toLowerCase().replace(/(?:\r\n|\r|\n)/g, ' ').replace("-", " ").includes(phrase[0])) {
                let add = true;

                if (Math.round(complexity * 10) / 10 <= 1  && checkComplexity) {
                    console.log("Removed", wordPhrase, complexity);
                    add = false;
                    break;
                }

                if (add) {
                    uniquePhrases.add([...wordPhrase]);
                    // if (secondary) {
                    //     i += j - i + 1;
                    //     break;
                    // }
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

export default function Home({ srcInit, trackInit, complexityData, phraseDefinitions, llm, questions, mouseEnabled, forcePause, toggleDefinitions, showDefinitions, definitionCallback, definitionContainerCallback, endCallback, record, recordCallback }) {
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

    let eyeGazeRecordData = useRef([]);
    let questionRecordData = useRef([]);
    let definitionRecordData = useRef([]);
    let scoresRecordData = useRef({});
    
    let checkOverlap = (uniquePhrases, text) => {
        // console.log("Start", [...uniquePhrases]);
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

                // console.log(cutPrevPhrase, cutNextPhrase);
                
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

            // console.log("Block", firstBlock, secondBlock);
            // console.log("BlockIndex", firstIndex, secondIndex);

            if (firstIndex + 1 < uniquePhrases.length) {
                for (let i = 0; i < firstBlock.length; i++) {                    
                    // console.log("Check", firstBlock[i], secondBlock[secondBlock.length - 1]);

                    if (
                        firstBlock[i].join(" ").endsWith(secondBlock[secondBlock.length - 1].join(" "))
                    ) {
                        if (newPhrases.length > 0) {
                            let cutIndex = getCutIndex(newPhrases[newPhrases.length - 1], firstBlock[i]);
    
                            if (cutIndex > 0) {
                                uniquePhrases.splice(firstIndex - firstBlock.length, firstBlock.length);
                                
                                // console.log("Changed Post3", [...uniquePhrases]);
                                // console.log(secondBlockIndex - firstBlock.length);
                                if (secondBlockIndex - firstBlock.length + 1 === uniquePhrases.length && startSecondIndex === 0) {
                                    newPhrases.push(uniquePhrases[uniquePhrases.length - 1]);
                                }
                                secondBlockIndex -= firstBlock.length - 1;
                                // console.log(secondBlockIndex)
                                continue main;
                            }
                        }

                        uniquePhrases.splice(firstIndex + 1, secondBlock.length);
                        // console.log("Changed Post1", [...uniquePhrases]);

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

            
            // console.log("Check2", secondIndex, uniquePhrases.length);
            // if (secondIndex + 1 < uniquePhrases.length) {
                // let [thirdBlock, thirdIndex] = getBlock(secondIndex + 1);

                // // console.log("Block2", thirdBlock);

                // if (thirdBlock.length > 0) {
                //     for (let i = 0; i < secondBlock.length; i++) {
                        
                //         console.log("Check2", secondBlock[i], thirdBlock[thirdBlock.length - 1]);
                //         // console.log("Check", prevCutIndex, nextCutIndex);

                //         if (thirdBlock.length > 0 && thirdIndex !== uniquePhrases.length && 
                //             secondBlock[i].join(" ").endsWith(thirdBlock[thirdBlock.length - 1].join(" "))
                //         ) {
                //             for (let j = 0; j < firstBlock.length; j++) {
                //                 let cutIndex = getCutIndex(firstBlock[j], secondBlock[i]);
                                
                //                 if (cutIndex === 0 && thirdIndex + thirdBlock.length === uniquePhrases.length) {
                //                     break;
                //                 }

                //                 if (cutIndex === 1) {
                //                     uniquePhrases.splice(firstIndex + 1, secondBlock.length);
                //                     console.log("Changed Post2", [...uniquePhrases]);
                //                     continue main;
                //                 }
                //             }
                //         }
                //     }
                // }
            // }

            // console.log(firstBlock, secondBlock);
            
            while (startFirstIndex < firstBlock.length && startSecondIndex < secondBlock.length) {
                let firstPhrase = firstBlock[startFirstIndex];
                let secondPhrase = secondBlock[startSecondIndex];

                // console.log(firstPhrase, secondPhrase);
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
                        // optimalIndex = startFirstIndex;
                        startFirstIndex++;
                    }

                    // if (startSecondIndex === secondBlock.length) {
                    //     optimalIndex = firstBlock.length - 1;
                    // }
                } else {
                    if (optimalIndex > 0 && firstPhrase.includes(secondPhrase))
                        optimalIndex--;
                    break;
                    startFirstIndex++;
                }
                // console.log("Optimal", firstBlock[optimalIndex]);
            }
            // console.log(startFirstIndex, startSecondIndex);
            // console.log(firstBlock[optimalIndex]);

            if (startFirstIndex === firstBlock.length - 1 && startSecondIndex === secondBlock.length) {
                uniquePhrases.splice(firstIndex + 1, secondBlock.length);
                // console.log("Changed", [...uniquePhrases]);
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
        // console.log("New", [...newPhrases]);
        let change = true;

        while (change) {
            change = false;

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
                
                let cutPrevPhrase = [...prevPhrase].slice(0, prevPhrase.length - cutIndex).map(word => complexityMap.current.get(word) || 0);
                let cutCurrPhrase1 = [...currPhrase].slice(cutIndex).map(word => complexityMap.current.get(word) || 0);

                // console.log(prevPhrase, currPhrase);
                // console.log(cutPrevPhrase.reduce((a, b) => a + b, 0));
                // console.log(curCurrPhrase1.reduce((a, b) => a + b, 0));

                if (cutIndex > 0) {
                    if (cutCurrPhrase1.reduce((a, b) => a + b, 0) < cutPrevPhrase.reduce((a, b) => a + b, 0)) {
                        newPhrases.splice(i, 1);
                        change = true;
                    } else {
                        newPhrases.splice(i - 1, 1);
                        change = true;
                    }
                }
            }
            
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
            
            // for (let i = 0; i < newPhrases.length - 1; i++) {
            //     let firstPhrase = newPhrases[i];
            //     let secondPhrase = newPhrases[i + 1];

            //     if (firstPhrase.join(" ").includes(secondPhrase.join(" "))) {
            //         newPhrases.splice(i + 1, 1);
            //         change = true;
            //         // console.log("removed", secondPhrase);
            //         // i--;
            //     }
            // }
        }
        // console.log(newPhrases);
        return newPhrases;
    }
    
    let timerCallback = (t) => {
        let prevIndex = delayIndex.current;
        index.current = -1;
        delayIndex.current = -1;
        
        if (t > 0) {
            end.current = false;
        } else if (t === 0 && !onQuestions.current) {
            wordScores.current.clear();
            frameScores.current.clear();
            definitionScores.current.clear();
            console.log("reset")
        }

        for (let i = 0; i < rawCaptions.current.length; i++) {
            let startTime = rawCaptions.current[i].data.start;
            let endTime = rawCaptions.current[i].data.end;
            let delayEndTime = rawCaptions.current[i].data.end + 500;

            if (t * 1000 >= startTime && t * 1000 <= endTime) {
                index.current = i;
            }

            if (t * 1000 >= startTime && t * 1000 <= delayEndTime) {
                delayIndex.current = i;
                break;
            } else if (t * 1000 < startTime) {
                break;
            }
        }
        
        if (prevIndex !== delayIndex.current && delayIndex.current >= 0 && rawCaptions.current[delayIndex.current]) {
            // let filteredWords = words.map(word => removeStopwords([word])[0]);
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
            // console.clear()
            
            let slicePhrase = (phrase, subTitle, map, startIndex, ifSlice = false) => {
                let slice = subTitle.search(phrase.join(" ").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
                let slideSubtitle = ifSlice ? phrase.join(" ") : subTitle.slice(startIndex, slice);
                let chunkWords = tokenize.extract(slideSubtitle, { toLowercase: true, regex: [tokenize.words] });
                startIndex = slice + phrase.join(" ").length;
                let averageComplexity = uniquePhrases.map(phrase => phrase.map(word => complexityMap.current.get(word) || 0).reduce((a, b) => a + b, 0) / phrase.length).reduce((a, b) => a + b, 0) / uniquePhrases.length;

                if (chunkWords) {
                    let phraseDefinition = phrases.current.get(subTitle);
                    let setWords = new Map()

                    for (let word of chunkWords) {
                        if (complexityMap.current.get(word) > (map === definitionsList ? (uniquePhrases.length === 0 ? 0 : 4) : 2) && additionalPhrases.current.get(word)) {
                            let d = additionalPhrases.current.get(word);
                            d.complexity = complexityMap.current.get(word);

                            if (phraseDefinition && (phraseDefinition.definitionTerm1.term.toLowerCase().includes(word) || phraseDefinition.definitionTerm2.term.toLowerCase().includes(word)))
                                continue;

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
                definitions.definitionTerm1.collocation = tokenize.extract(definitions.definitionTerm1.term, { toLowercase: true, regex: [tokenize.words, tokenize.numbers] }) || [];
                definitions.definitionTerm1.complexity = definitions.definitionTerm1.collocation.map(word => complexityMap.current.get(word) || 0);
                definitions.definitionTerm1.complexity = definitions.definitionTerm1.complexity.reduce((a, b) => a + b, 0) / definitions.definitionTerm1.complexity.length;
                definitions.definitionTerm2.collocation = tokenize.extract(definitions.definitionTerm2.term, { toLowercase: true, regex: [tokenize.words, tokenize.numbers] }) || [];
                definitions.definitionTerm2.complexity = definitions.definitionTerm2.collocation.map(word => complexityMap.current.get(word) || 0);
                definitions.definitionTerm2.complexity = definitions.definitionTerm2.complexity.reduce((a, b) => a + b, 0) / definitions.definitionTerm2.complexity.length;
                let additional = new Map();
                let skipTerm1 = false, skipTerm2 = false;
                // console.log(phrase)
                startIndex = slicePhrase(phrase, subTitle, definitionsList, startIndex);

                if ((definitions.definitionTerm1.term + " " + definitions.definitionTerm2.term).toLowerCase() !== definitions.definitionPhrase.phrase.toLowerCase()) {
                    let uniqueSecondPhrases = checkOverlap([...getCollocation(phrase.join(" "), phrases.current, complexityMap.current, true, additionalPhrases.current)], phrase.join(" "));
                    let secondStartIndex = 0;

                    for (let secondPhrase of uniqueSecondPhrases) {
                        let secondDefinitions = phrases.current.get(secondPhrase.join(" ")) || additionalPhrases.current.get(secondPhrase.join(" "));
                        let secondComplexity = secondPhrase.map(word => complexityMap.current.get(word) || 0).reduce((a, b) => a + b, 0) / secondPhrase.length;
                        let secondSlice = phrase.join(" ").search(secondPhrase.join(" ").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
                        let secondSliceSubtitle = sliceSubtitle.slice(secondSlice, secondSlice + secondPhrase.join(" ").length);
                        
                        secondDefinitions.complexity = secondComplexity;
                        secondDefinitions.collocation = secondPhrase;
                        secondDefinitions.subtitle = secondSliceSubtitle;
                        additional.set(secondPhrase.join(" "), secondDefinitions);

                        secondStartIndex = slicePhrase(secondPhrase, phrase.join(" "), additional, secondStartIndex);
                        
                        if (!skipTerm1 && secondPhrase.join(" ").includes(definitions.definitionTerm1.term.toLowerCase())) {
                            skipTerm1 = secondDefinitions;
                            additional.delete(secondPhrase.join(" "));
                        }

                        if (!skipTerm2 && secondPhrase.join(" ").includes(definitions.definitionTerm2.term.toLowerCase())) {
                            skipTerm2 = secondDefinitions;
                            additional.delete(secondPhrase.join(" "));
                        }
                    }
                    
                    if (uniqueSecondPhrases.length > 0) {
                        slicePhrase([phrase.join(" ").slice(secondStartIndex)], phrase.join(" "), additional, secondStartIndex, true);
                    } else {
                        slicePhrase(phrase, phrase.join(" "), additional, secondStartIndex, true);
                    }
                }
                
                if (skipTerm1 && skipTerm2 && skipTerm1.definitionPhrase.phrase.toLowerCase() === skipTerm2.definitionPhrase.phrase.toLowerCase()) {
                    skipTerm2 = true;
                }
                definitionsList.set(phrase.join(" "), {"subtitle": sliceSubtitle, "collocation": phrase, "definitions": definitions, "additional": additional, "skipTerm1": skipTerm1, "skipTerm2": skipTerm2});
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
        if (onQuestions.current) {
            return;
        }
        onQuestions.current = true;
        end.current = true;
        forcePauseRef.current = true;

        let sortScores = new Map();
        console.log(wordScores.current);
        console.log(frameScores.current);
        console.log(definitionScores.current);

        let addScores = (map) => {
            for (let [word, scores] of map) {
                if (names.current.has(word)) {
                    continue;
                }

                for (let [index, score] of scores) {
                    if (sortScores.has(word + index)) {
                        sortScores.get(word + index).score += score.score.reduce((a, b) => a + b, 0);
                    } else {
                        sortScores.set(word + index, {word: word, index: index, score: score.score.reduce((a, b) => a + b, 0)});
                    }
                }
            }
        }
        addScores(wordScores.current);
        // addScores(frameScores.current);
        addScores(definitionScores.current);

        let topWords = [...sortScores.entries()];
        topWords.sort((a, b) => b[1].score - a[1].score);
        console.log(topWords);
        
        let questions = [];
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
            console.log(startAllTime, endAllTime)
            console.log(subtitle);

            let collocation = word.word;
            // let collocations = getCollocation(subtitle, phrases);
            // let occurence = 0;

            // for (let phrase of collocations) {
            //     if (phrase.includes(word.word)) {
            //         if (occurence === word.wordIndex) {
            //             collocation = phrase;
            //             break;
            //         } else {
            //             occurence++;
            //         }
            //     }
            // }
            questionData.push({subtitle: subtitle, collocation: collocation, startTime: startAllTime, endTime: endAllTime});
            console.log(collocation);

            if (questionData.length === 5 || (i === topWords.length - 1 && questionTime.size === 0)) {
                break;
            }

            if (i === topWords.length - 1 && questionData.length < 4) {
                i = 0;
                questionTime.clear();
            }
        }
        console.log("LLM", llmRef.current);

        if (llmRef.current) {
            if (questionData.length === 0) {
                if (endCallbackRef.current instanceof Function) {
                    endCallbackRef.current();
                }
                return;
            }

            let promises = [];

            for (let i = 0; i < questionData.length; i++) {
                let subtitle = questionData[i].subtitle;
                let collocation = questionData[i].collocation;
            // for (let i = 0; i < 1; i++) {
            //     let subtitle = `It could be some new kind of personal water
            //     purifier, or makeup that lasts as long as you want
            //     it to, or a revolutionary clothing material.`;
            //     let collocation = "";

                promises.push(generateQuestion(subtitle, collocation)
                .then(qData => {
                    qData.subtitle = subtitle;
                    // qData.startTime = Math.random() * 5 + 1;
                    // qData.endTime = Math.random() * 5 + 6;
                    qData.startTime = questionData[i].startTime / 1000;
                    qData.endTime = questionData[i].endTime / 1000;
                    qData.collocation = collocation;

                    questions.push(qData);
                    console.log(qData);
                    // if (questionData) 
                    //     console.log(questionData.arguments);
                }));

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
                    closeOnClick: true,
                    pauseOnHover: true,
                    draggable: true,
                    theme: "dark",
                    toastId: "questionToast"
                }
            )
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
                let choices = [choiceA, choiceB, choiceC, choiceD];
                let shuffled = shuffle(choices);

                question.choiceA = shuffled.next().value;
                question.choiceB = shuffled.next().value;
                question.choiceC = shuffled.next().value;
                question.choiceD = shuffled.next().value;
                
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
        });
    };

    let questionCallback = (questionData, submittedAnswer) => {
        if (ifRecord.current) {
            questionRecordData.current.push({question: questionData, submittedAnswer: submittedAnswer, timestamp: new Date().getTime() });
        }
    }

    let questionEndCallback = () => {
        forcePauseRef.current = false;
        onQuestions.current = false;

        setShowDefinitionContainer(true);

        if (!definitionToggle.current) {
            d3.select("#video")
            .transition()
            .duration(1000)
            .styleTween("transform", () => d3.interpolate(d3.select("#video").style("transform"), "translateX(-15%)"))
        }

        if (endCallbackRef.current instanceof Function) {
            endCallbackRef.current();
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
        let heatmap = h337.create({
            container: d3.select("main").node(),
            radius: 60,
        });
        heatmap.setData({min: 0, max: 0, data: []});

        return () => {
            d3.select(".heatmap-canvas").remove();
        };
    }, []);

    useEffect(() => {
        // playerEndCallback();

        fetch(track)
        .then(response => response.text())
        .then(async data => {
            rawCaptions.current = parseSync(data).filter(n => n.type === "cue");
            // let phraseList = [];

            // for (let i = 0; i < rawCaptions.current.length; i++) {
            //     let words = tokenize.extract(rawCaptions.current[i].data.text, { toLowercase: true, regex: [tokenize.words, tokenize.numbers] });
            //     phraseList.push(words);
                // let filteredWords = words.map(word => removeStopwords([word])[0]);
                // console.log(filteredWords);
                // let phrase = [];
                
                // for (let fw of filteredWords) {
                //     if (fw) {
                //         phrase.push(fw);
                //     } else {
                //         if (phrase.length > 1) {
                //             console.log(phrase);
                //             phraseList.push(phrase);
                //         }
                //         phrase = [];
                //     }
                // }
                // if (phrase.length > 1) {
                //     phraseList.push(phrase);
                // }
            // }
            // console.log(phraseList);
            
            // let testPhraseList = phraseList.slice(3, 4);
            // let testPhraseList = phraseList;
            // let finisedPhrases = 0;
            // let newPhrases = new Map();
            // console.log(testPhraseList);

            // for (let testPhrase of testPhraseList) {
            //     parsePhrase(testPhrase)
            //     .then(phraseMap => {
            //         finisedPhrases += 1;
            //         newPhrases = new Map([...newPhrases, ...phraseMap]);

            //         if (testPhraseList.length === finisedPhrases) {
            //             console.log(JSON.stringify(newPhrases, replacer));
            //             console.log(JSON.parse(JSON.stringify(newPhrases, replacer), reviver));
            //         }
            //     });
            // }

            // let uniqueWords = new Set();
            // let newComplexity = new Map();
            // let processedWords = 0;
            // let finishedWords = 0;
            
            // for (let i = 0; i < rawCaptions.current.length; i++) {
            //     let words = tokenize.extract(rawCaptions.current[i].data.text.replace("-", " "), { toLowercase: true, regex: [tokenize.words] });
            //     words = removeStopwords(words);

            //     for (let word of words) {
            //         if (word.replace(/[^a-zA-Z ]/g, "") !== "")
            //             uniqueWords.add(word);
            //     }
            // }
            // for (let word of uniqueWords) {
            //     processedWords += 1;

            //     getComplexity(word)
            //     .then((score) => {
            //         finishedWords += 1;
            //         newComplexity.set(word, score);
            //         console.log(finishedWords)

            //         if (processedWords === finishedWords) {
            //             console.log(JSON.stringify(newComplexity, replacer));
            //             console.log(JSON.parse(JSON.stringify(newComplexity, replacer), reviver));
            //         }
            //     });
            // }
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
                recordCallback({eyeData: [...eyeGazeRecordData.current], questionData: [...questionRecordData.current], definitionData: definitionToggle.current ? [...definitionRecordData.current] : ["No definitions"], scoresData: {...scoresRecordData.current}});
            
            eyeGazeRecordData.current = [];
            questionRecordData.current = [];
            definitionRecordData.current = [];
            scoresRecordData.current = {};
        }
    }, [record, recordCallback]);

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
            definitionToggle.current = false;
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
                        // console.log(innerText, collocation, collocation[index]);
                        
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
                        // console.log([...subtitleNodes].map(d => d.innerText))

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
                    console.log("fail", collocation);
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
            if ((
                definition.definitionTerm1.definition.includes("given name") || 
                definition.definitionTerm1.definition.includes("common name") ||
                definition.definitionTerm1.definition.includes("common male name") ||
                definition.definitionTerm1.definition.includes("common female name") ||
                definition.definitionTerm1.definition.includes("person's name") ||
                definition.definitionTerm1.definition.includes("people's name") ||
                definition.definitionTerm1.definition.includes("person named") ||
                definition.definitionTerm1.definition.includes("someone named") ||
                definition.definitionTerm1.definition.includes("name of a person") ||
                definition.definitionTerm1.definition.includes("person with the name") ||
                definition.definitionTerm1.definition.includes("last name") ||
                definition.definitionTerm1.definition.includes("first name") ||
                definition.definitionTerm1.definition.includes("surname"))
            ) {
                // let nameWords = tokenize.extract(definition.definitionTerm1.term, { toLowercase: true, regex: [tokenize.words] });

                // for (let nameWord of nameWords) {
                //     if (nameWord.length > 2) {
                //         // console.log(nameWord);
                //         names.current.add(nameWord);
                //     }
                // }
                if (definition.definitionTerm1.term.length > 2) {
                    names.current.add(definition.definitionTerm1.term.toLowerCase());
                    
                    // console.log(definition.definitionTerm1.term);
                }
            }

            if ((
                definition.definitionTerm2.definition.includes("given name") || 
                definition.definitionTerm2.definition.includes("common name") ||
                definition.definitionTerm2.definition.includes("common male name") ||
                definition.definitionTerm2.definition.includes("common female name") ||
                definition.definitionTerm2.definition.includes("person's name") ||
                definition.definitionTerm2.definition.includes("people's name") ||
                definition.definitionTerm2.definition.includes("person named") ||
                definition.definitionTerm2.definition.includes("someone named") ||
                definition.definitionTerm2.definition.includes("name of a person") ||
                definition.definitionTerm2.definition.includes("person with the name") ||
                definition.definitionTerm2.definition.includes("last name") ||
                definition.definitionTerm2.definition.includes("first name") ||
                definition.definitionTerm2.definition.includes("surname"))
            ) {
                // let nameWords = tokenize.extract(definition.definitionTerm2.term, { toLowercase: true, regex: [tokenize.words] });

                // for (let nameWord of nameWords) {
                //     if (nameWord.length > 2) {
                //         names.current.add(nameWord);
                //         // console.log(nameWord);
                //     }
                // }
                if (definition.definitionTerm2.term.length > 2) {
                    names.current.add(definition.definitionTerm2.term.toLowerCase());
                    
                    // console.log(definition.definitionTerm2.term);
                }
            }
        }
        
        loop: for (let [collocation, definition] of phrases.current) {
            if (
                !collocation.toLowerCase().includes(definition.definitionTerm1.term.toLowerCase())
            ) {
                definition.definitionTerm1.term = "";
                definition.definitionTerm1.definition = "";
                // phrases.current.delete(collocation);
            }

            if (
                !collocation.toLowerCase().includes(definition.definitionTerm2.term.toLowerCase())
            ) {
                definition.definitionTerm2.term = "";
                definition.definitionTerm2.definition = "";
                // phrases.current.delete(collocation);
            }
            
            if (definition.definitionPhrase.definition.toLowerCase().replace("’", "'").includes(collocation.replace("’", "'").toLowerCase())) {
                let startIndex = definition.definitionPhrase.definition.toLowerCase().replace("’", "'").search(collocation.replace("’", "'").toLowerCase());
                definition.definitionPhrase.definition = definition.definitionPhrase.definition.slice(startIndex + collocation.length).trim();
                definition.definitionPhrase.definition.split(" ")[0].search(/[a-zA-Z]/) === -1 ? definition.definitionPhrase.definition = definition.definitionPhrase.definition.slice(definition.definitionPhrase.definition.split(" ")[0].length).trim() : null;
            }

            for (let name of names.current) {
                // let startIndex = collocation.toLowerCase().search(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
                // let endIndex = startIndex + name.length;
                // name = startIndex === 0 ? name + " " : name;
                // name = endIndex === collocation.length ? " " + name : name;

                // startIndex = definition.definitionTerm1.term.toLowerCase().search(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
                // let term1 = startIndex === 0 ? definition.definitionTerm1.term.toLowerCase() + " " : definition.definitionTerm1.term.toLowerCase();
                // term1 = startIndex + name.length === definition.definitionTerm1.term.length ? term1 + " " : term1;

                // startIndex = definition.definitionTerm2.term.toLowerCase().search(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
                // let term2 = startIndex === 0 ? definition.definitionTerm2.term.toLowerCase() + " " : definition.definitionTerm2.term.toLowerCase();
                // term2 = startIndex + name.length === definition.definitionTerm2.term.length ? term2 + " " : term2;
                let c = phrases.current.get(collocation);
                if (
                    // (collocation.toLowerCase().includes(name) && 
                    // (c.definitionPhrase.definition.includes("person's name") ||
                    // c.definitionPhrase.definition.includes("person with the name") ||
                    // c.definitionPhrase.definition.includes("surname")))
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
                    // console.log("removed:", collocation, phrases.current.get(collocation), name)
                    phrases.current.delete(collocation);
                    continue loop;
                }
            }
            additionalPhrases.current.set(definition.definitionTerm1.term, { definitionPhrase: {phrase: definition.definitionTerm1.term, definition: definition.definitionTerm1.definition}});
            additionalPhrases.current.set(definition.definitionTerm2.term, { definitionPhrase: {phrase: definition.definitionTerm2.term, definition: definition.definitionTerm2.definition}});
        }
    }, [phraseDefinitions]);

    let oneeuroX = useRef(new OneEuroFilter(1 / 33, 0.0008, 0.001, 1));
    let oneeuroY = useRef(new OneEuroFilter(1 / 33, 0.0008, 0.001, 1));
    let rbfchain = useRef(new RBFChain(0.01, 0.95, 0.175, 1.0));
    let rbfchainFrame = useRef(new RBFChain(0.01, 0.95, 0.665, 1.0));
    let lastTime = useRef(null), currentTime = useRef(null), dt = useRef(null);
    let timeout = useRef(null);
    
    useEffect(() => {

        // ipcRenderer.on('fixation-pos', (event, arg) => {
        //     let x = oneeuroFixationX.filter(arg.x, arg.timestamp);
        //     let y = oneeuroFixationY.filter(arg.y, arg.timestamp);

        //     d3.select("#fixationCursor")
        //     .style("width", userCenterRadius * 2 + "px")
        //     .style("height", userCenterRadius * 2 + "px")
        //     .style("transform", "translate(" + (x  - userCenterRadius) + "px, " + (y - userCenterRadius) + "px)");
        // });

        let addScores = (map, word, score) => {
            if (map.has(word)) {
                if (map.get(word).has(index.current)) {
                    map.get(word).get(index.current).score.push(score)
                    map.get(word).get(index.current).dt.push(dt.current)
                } else {
                    map.get(word).set(index.current, {score: [score], dt: [dt.current]});
                }
            } else {
                map.set(word, new Map().set(index.current, {score: [score], dt: [dt.current]}));
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
                let nodes = d3.selectAll(".vjs-text-track-cue div span").nodes();
                let userCenterRadius = headDistancesRef.current * Math.tan(4 * Math.PI/180) * 0.393701 * 127 / 2;
                // console.log(screen.height - document.documentElement.clientHeight)

                if (x && y) {
                    if (ifRecord.current) {
                        eyeGazeRecordData.current.push({x: x, y: y, timestamp: currentTime.current, xOffset: xOffset, yOffset: yOffset});
                    }
                    // heatmap.addData({ x: x, y: y });

                    d3.select("#gazeCursor")
                    .style("width", userCenterRadius * 2 + "px")
                    .style("height", userCenterRadius * 2 + "px")
                    .style("transform", "translate(" + (x  - userCenterRadius) + "px, " + (y - userCenterRadius) + "px)");

                    let input_data = Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
                    let probability = rbfchain.current.add_element(input_data);
                    let is_fixation = probability >= rbfchain.current.delta;
                    let probabilityFrame = rbfchainFrame.current.add_element(input_data);
                    let is_fixationFrame = probabilityFrame >= rbfchainFrame.current.delta;

                    // d3.select("body")
                    // .append("div")
                    // .style("transform", "translate(" + (x - 5) + "px, " + (y - 5) + "px)")
                    // .style("width", "10px")
                    // .style("height", "10px")
                    // .style("position", "absolute")
                    // .style("top", "0")
                    // .style("left", "0")
                    // .style("border-radius", "50%")
                    // .style("pointer-events", "none")
                    // .style("background-color", is_fixation ? "red" : "green")
                    // .style("z-index", 999)
                    
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
                                        addScores(definitionScores.current, word, score);
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

                            for (let wordNode of nodes) {
                                d3.select(wordNode).style("background-color", null);
                                let wordBbox = wordNode.getBoundingClientRect();
                                let text = tokenize.extract(d3.select(wordNode).text(), { toLowercase: true, regex: [tokenize.words] });

                                if (text instanceof Array && playerArea && is_fixation) {
                                    for (let word of text) { 
                                        if (complexityMap.current.has(word)) {
                                            let frameScore = (Math.log10(nodes.length) + 1) * Math.sqrt(dt.current) * (complexityMap.current.get(word) / 5) * 1000;
                                            addScores(frameScores.current, word, frameScore);
                                        }
                                    }
                                }
                                
                                if (text instanceof Array && is_fixationFrame && rectCircleColliding(circle, wordBbox)) {
                                    let d = Math.pow(wordBbox.x + wordBbox.width / 2 - circle.x, 2) + Math.pow(wordBbox.y + wordBbox.height / 2 - circle.y, 2);

                                    for (let word of text) {                                    
                                        if (complexityMap.current.has(word)) {
                                            let score = (1 / nodes.length) * Math.sqrt(dt.current) * (1 / (d + 1)) * (complexityMap.current.get(word) / 5) * 1000;
                                            addScores(wordScores.current, word, score);
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
                                    // setShowDefinition(null);
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
                                // setShowDefinition(null);
                                setShowMoreInfo(false);
                            }
                        }
                    }

                    // for (let wordNode of nodes) {
                    //     let text = tokenize.extract(d3.select(wordNode).text(), { toLowercase: true, regex: [tokenize.words] });

                    //     if (text instanceof Array) {
                    //         for (let word of text) {
                    //             if (wordScores.current.has(word) && wordScores.current.get(word).has(index.current)) {
                    //                 // console.log(wordScores.current.get(word).get(index.current));
                    //                 let score = wordScores.current.get(word).get(index.current).score.reduce((a, b) => a + b, 0);
                    //                 let totalScores = [];

                    //                 for (let [_, value1] of wordScores.current) {
                    //                     for (let [_, value] of value1) {
                    //                         totalScores.push(value.score.reduce((a, b) => a + b, 0));
                    //                     }
                    //                 }
                    //                 let color = d3.scaleSequentialLog().interpolator(d3.interpolateTurbo).domain(d3.extent(totalScores));
                    //                 d3.select(wordNode)
                    //                 .style("background-color", color(score))
                    //                 .style("color", isTooLight(color(score).slice(1)) ? "#000" : "#fff");
                    //             } else {
                    //                 d3.select(wordNode).style("background-color", null);
                    //             }
                    //         }
                    //     }
                    // }
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

                // args.x -= (screen.width - document.documentElement.clientWidth);
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
                />

                <QuestionForm questionData={questionData} questionCallback={questionCallback} endCallback={questionEndCallback} reviewCallback={trim} />
            </div>
            
            <DefinitionsContainer collocations={collocations} show={showDefinitionContainer} showDefinition={showDefinition} showMoreInfo={showMoreInfo} onPrev={onPrev} definitionCallback={definitionCallbackState} />
            <ToastContainer transition={Flip} />
        </>
    );
}
