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

function getCollocation(text, phrases, complexityMap, secondary = false, additionalPhrases = new Map()) {
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

                if (Math.round(complexity * 10) / 10 <= 1.5) {
                    add = false;
                    console.log("removed: " + wordPhrase.join(" "), complexity);
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
        let checkSecondary = getCollocation(text, phrases, complexityMap, true);
        return (checkSecondary.size > 0 ? checkSecondary : uniquePhrases)
    } else {
        return uniquePhrases;
    }
}

export default function Home({ srcInit, trackInit, complexityData, phraseDefinitions, endCallback, mouseEnabled, toggleDefinitions }) {
    let [ questionData, setQuestion ] = useState("");
    let [ paused, setPaused ] = React.useState(true);
    let [ videoTime, setVideoTime ] = React.useState(-1);
    let [ src, setSrc ] = React.useState(srcInit);
    let [ track, setTrack ] = React.useState(trackInit);
    let [ collocations, setCollocations ] = React.useState(new Map());
    let [ showDefinitionContainer, setShowDefinitionContainer ] = React.useState(!toggleDefinitions);
    let [ showDefinition, setShowDefinition ] = React.useState(false);
    let [ showMoreInfo, setShowMoreInfo ] = React.useState(false);
    let [ onPrev, setOnPrev ] = React.useState(false);

    let wordScores = useRef(new Map());
    let frameScores = useRef(new Map());
    let definitionScores = useRef(new Map());
    let definitionToggle = useRef(toggleDefinitions);
    let index = useRef(-1), delayIndex = useRef(-1);
    let rawCaptions = useRef([]);
    let forcePause = useRef(true), end = useRef(false), onQuestions = useRef(false);
    let complexityMap = JSON.parse(JSON.stringify(complexityData), reviver);
    let phrases = JSON.parse(JSON.stringify(phraseDefinitions), reviver);
    let additionalPhrases = useRef(new Map());
    let x = useRef(0), y = useRef(0);
    let endCallbackRef = useRef(endCallback);
    
    let checkOverlap = (uniquePhrases, text) => {
        if (uniquePhrases.length <= 1) {
            return uniquePhrases;
        }
        let newPhrases = [];
        let newUniquePhrases = new Set();

        let getCutIndex = (prevPhrase, nextPhrase) => {
            let tPhrase = (nextPhrase.length < prevPhrase.length) ? nextPhrase : prevPhrase;
            let cutIndex = 0;

            loop: for (let j = 0; j < tPhrase.length; j++) {
                let cutPrevPhrase = prevPhrase.slice(prevPhrase.length - 1 - j, prevPhrase.length).join(" ");
                let cutNextPhrase = nextPhrase.slice(0, j + 1).join(" ");
                
                for (let i = 0; i < cutPrevPhrase.length; i++) {
                    if (cutPrevPhrase[i] !== cutNextPhrase[i]) {
                        continue loop;
                    }
                }
                cutIndex = j + 1;
            }
            return cutIndex;
        }

        let getBlock = (index) => {
            let firstBlock = [uniquePhrases[index]];

            for (let j = index + 1; j < uniquePhrases.length; j++) {
                if (uniquePhrases[j].join(" ").startsWith(uniquePhrases[index].join(" "))) {
                    firstBlock.push(uniquePhrases[j]);
                } else {
                    index = j - 1;
                    break;
                }
            }
            return [firstBlock, index];
        }
        let [firstBlock, firstIndex] = getBlock(0);
        let partial = false, first = true;

        for (let i = firstIndex + 1; i < uniquePhrases.length; i++) {
            let [secondBlock, secondIndex] = getBlock(i);
            let optimalPhrase = null;
            let cutIndex = 0;
            let firstPhrase, secondPhrase;
            secondBlock.reverse();

            loop: for (firstPhrase of firstBlock.reverse()) {
                for (secondPhrase of secondBlock) {
                    cutIndex = getCutIndex(firstPhrase, secondPhrase);

                    if (cutIndex === secondPhrase.length) {
                        // if (!optimalPhrase)
                            optimalPhrase = partial ? secondPhrase : firstPhrase;
                        break loop;
                    } else if (cutIndex === firstPhrase.length) {
                        // if (!optimalPhrase)
                            optimalPhrase = partial ? firstPhrase: secondPhrase;
                            break loop;
                    } else if (cutIndex === 0) {
                        if (!firstPhrase.join(" ").includes(secondPhrase.join(" "))) {
                            optimalPhrase = firstPhrase;
                            break loop;
                        } else {
                            optimalPhrase = firstPhrase;
                            partial = false;
                        }
                    } else {
                        optimalPhrase = firstPhrase;
                    }
                }
            }
            partial = cutIndex > 0 && cutIndex < optimalPhrase.length;
            i = secondIndex;
            firstBlock = secondBlock.reverse();

            if (first && partial) {
                let firstComplexity = firstPhrase.map(word => complexityMap.get(word) || 0).reduce((a, b) => a + b, 0);
                let secondComplexity = secondPhrase.map(word => complexityMap.get(word) || 0).reduce((a, b) => a + b, 0);

                if (firstComplexity < secondComplexity) {
                    optimalPhrase = []
                } else {
                    [secondBlock, secondIndex] = getBlock(secondIndex + 1);
                    i = secondIndex;
                    firstBlock = secondBlock;
                }
            }
            first = false;

            if (optimalPhrase && optimalPhrase.length > 0 && !newUniquePhrases.has(optimalPhrase.join(" "))) {
                newPhrases.push(optimalPhrase);
                newUniquePhrases.add(optimalPhrase.join(" "));
            }
            
            if (secondIndex === uniquePhrases.length - 1) {
                newPhrases.push(secondPhrase);
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
                i--;
                continue;
            }
            currPhrase.splice(0, cutIndex);
            currPhrase.splice(currPhrase.length - cutIndex2, cutIndex2);
            
            if (text.toLowerCase().includes(prevPhrase.join(" ") + " " + currPhrase.join(" ") + " " + nextPhrase.join(" ")) && 
                currPhrase.map(word => complexityMap.get(word) || 0).filter(x => x > 0).length === 0
            ) {
                newPhrases.splice(i, 1);
                i--;
            }
        }
        
        for (let i = 0; i < newPhrases.length - 1; i++) {
            let firstPhrase = newPhrases[i];
            let secondPhrase = newPhrases[i + 1];

            if (firstPhrase.join(" ").includes(secondPhrase.join(" "))) {
                newPhrases.splice(i + 1, 1);
                i--;
            }
            //  else if (secondPhrase.join(" ").includes(firstPhrase.join(" "))) {
            //     newPhrases.splice(i, 1);
            //     i--;
            // }
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
            let uniquePhrases = checkOverlap([...getCollocation(rawCaptions.current[delayIndex.current].data.text, phrases, complexityMap)], rawCaptions.current[delayIndex.current].data.text.replace(/(?:\r\n|\r|\n)/g, ' '));
            let definitionsList = new Map();
            let startIndex = 0;
            // console.clear()
            
            let slicePhrase = (phrase, ifSlice = false) => {
                console.log(phrase)
                let slice = subTitle.search(phrase.join(" "));
                let slideSubtitle = ifSlice ? phrase.join(" ") : subTitle.slice(startIndex, slice);
                let chunkWords = tokenize.extract(slideSubtitle, { toLowercase: true, regex: [tokenize.words] });
                startIndex = slice + phrase.join(" ").length;

                if (chunkWords) {
                    for (let word of chunkWords) {
                        if (complexityMap.get(word) > 3 && additionalPhrases.current.get(word)) {
                            let d = additionalPhrases.current.get(word);
                            d.complexity = complexityMap.get(word);

                            definitionsList.set(word, {
                                "collocation": [word],
                                "definitions": d,
                                "additional": null
                            });
                        }
                    }
                }
            }
            
            for (let i = 0; i < uniquePhrases.length; i++) {
                let phrase = uniquePhrases[i];
                let definitions = phrases.get(phrase.join(" "));
                let complexity = phrase.map(word => complexityMap.get(word) || 0).reduce((a, b) => a + b, 0) / phrase.length;
                definitions.complexity = complexity;
                definitions.definitionTerm1.collocation = tokenize.extract(definitions.definitionTerm1.term, { toLowercase: true, regex: [tokenize.words, tokenize.numbers] });
                definitions.definitionTerm1.complexity = definitions.definitionTerm1.collocation.map(word => complexityMap.get(word) || 0);
                definitions.definitionTerm1.complexity = definitions.definitionTerm1.complexity.reduce((a, b) => a + b, 0) / definitions.definitionTerm1.complexity.length;
                definitions.definitionTerm2.collocation = tokenize.extract(definitions.definitionTerm2.term, { toLowercase: true, regex: [tokenize.words, tokenize.numbers] });
                definitions.definitionTerm2.complexity = definitions.definitionTerm2.collocation.map(word => complexityMap.get(word) || 0);
                definitions.definitionTerm2.complexity = definitions.definitionTerm2.complexity.reduce((a, b) => a + b, 0) / definitions.definitionTerm2.complexity.length;
                let additional = new Map();
                let skipTerm1 = false, skipTerm2 = false;
                // console.log(phrase)
                slicePhrase(phrase);

                if ((definitions.definitionTerm1.term + " " + definitions.definitionTerm2.term).toLowerCase() !== definitions.definitionPhrase.phrase.toLowerCase()) {
                    let uniqueSecondPhrases = checkOverlap([...getCollocation(phrase.join(" "), phrases, complexityMap, true, additionalPhrases.current)], phrase.join(" "));

                    for (let secondPhrase of uniqueSecondPhrases) {
                        let secondDefinitions = phrases.get(secondPhrase.join(" ")) || additionalPhrases.current.get(secondPhrase.join(" "));
                        let secondComplexity = secondPhrase.map(word => complexityMap.get(word) || 0).reduce((a, b) => a + b, 0) / secondPhrase.length;
                        secondDefinitions.complexity = secondComplexity;
                        secondDefinitions.collocation = secondPhrase;
                        additional.set(secondPhrase.join(" "), secondDefinitions);
                        
                        if (!skipTerm1 && secondPhrase.join(" ").includes(definitions.definitionTerm1.term)) {
                            skipTerm1 = true;
                        }

                        if (!skipTerm2 && secondPhrase.join(" ").includes(definitions.definitionTerm2.term)) {
                            skipTerm2 = true;
                        }
                    }
                }
                definitionsList.set(phrase.join(" "), {"collocation": phrase, "definitions": definitions, "additional": additional, "skipTerm1": skipTerm1, "skipTerm2": skipTerm2});
            }
            slicePhrase([subTitle.slice(startIndex + uniquePhrases[uniquePhrases.length - 1].length)], true);
            setCollocations(definitionsList);
        } else if (delayIndex.current < 0) {
            setCollocations(new Map());
        }
        setShowDefinition(null);
        setShowMoreInfo(false);
    };

    let playerEndCallback = () => {
        if (onQuestions.current) {
            return;
        }
        end.current = true;
        forcePause.current = true;

        let sortScores = new Map();
        console.log(wordScores.current);
        console.log(frameScores.current);
        console.log(definitionScores.current);

        let addScores = (map) => {
            for (let [word, scores] of map) {
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
        addScores(frameScores.current);
        addScores(definitionScores.current);

        let topWords = [...sortScores.entries()];
        topWords.sort((a, b) => b[1].score - a[1].score);
        wordScores.current.clear();
        frameScores.current.clear();
        definitionScores.current.clear();
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

                if (startTime - startAllTime > 3000) {
                    break;
                }
            }
            
            for (let i = word.index + 1; i < rawCaptions.current.length; i++) {
                subtitle += rawCaptions.current[i].data.text.replace(/(?:\r\n|\r|\n)/g, ' ') + " ";
                endAllTime = rawCaptions.current[i].data.start - 10;

                if (endAllTime - endTime > 3000) {
                    break;
                }
            }
            console.log(startTime, endTime)
            console.log(startAllTime, endAllTime)

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

        if (questionData.length === 0) {
            if (endCallbackRef.current instanceof Function) {
                endCallbackRef.current();
            }
        }

        for (let i = 0; i < questionData.length; i++) {
            let subtitle = questionData[i].subtitle;
            let collocation = questionData[i].collocation;
        // for (let i = 0; i < 1; i++) {
        //     let subtitle = `It could be some new kind of personal water
        //     purifier, or makeup that lasts as long as you want
        //     it to, or a revolutionary clothing material.`;
        //     let collocation = "";

            generateQuestion(subtitle, collocation)
            .then(qData => {
                qData.subtitle = subtitle;
                // qData.startTime = Math.random() * 5 + 1;
                // qData.endTime = Math.random() * 5 + 6;
                qData.startTime = questionData[i].startTime / 1000;
                qData.endTime = questionData[i].endTime / 1000;

                questions.push(qData);
                console.log(qData);

                if (questionData.length === questions.length) {
                    setShowDefinitionContainer(false);
                    onQuestions.current = true;
                    
                    d3.select("#video")
                    .transition()
                    .duration(1000)
                    .styleTween("margin-right", () => d3.interpolate(d3.select("#video").style("margin-right"), toggleDefinitions ? "20%" : "0%"))
                    .on("end", () => {
                        setShowMoreInfo(false);
                        setShowDefinition(null);
                        setQuestion(questions);
                    });
                }
                // if (questionData) 
                //     console.log(questionData.arguments);
            });
        }
    };

    let questionEndCallback = () => {
        forcePause.current = false;
        onQuestions.current = false;

        if (!definitionToggle.current) {
            setShowDefinitionContainer(true);
        }
        d3.select("#video")
        .transition()
        .duration(1000)
        .styleTween("margin-right", () => d3.interpolate(d3.select("#video").style("margin-right"), toggleDefinitions ? "0%" : "20%"));

        if (endCallbackRef.current instanceof Function) {
            endCallbackRef.current();
        }
    };

    let clickCallback = (ifPaused) => {
        forcePause.current = ifPaused;

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
            //     let words = tokenize.extract(rawCaptions.current[i].data.text, { toLowercase: true, regex: [tokenize.words] });
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
        let names = new Set();

        for (let [collocation, definition] of phrases) {
            if (
                (definition.definitionTerm1.definition.includes("given name") || 
                definition.definitionTerm1.definition.includes("surname")) &&
                definition.definitionTerm1.term.length > 2
            ) {
                names.add(definition.definitionTerm1.term.toLowerCase());
            }

            if (
                (definition.definitionTerm2.definition.includes("given name") ||
                definition.definitionTerm2.definition.includes("surname")) &&
                definition.definitionTerm2.term.length > 2
            ) {
                names.add(definition.definitionTerm2.term.toLowerCase());
            }
        }
        
        loop: for (let [collocation, definition] of phrases) {
            if (
                !collocation.toLowerCase().includes(definition.definitionTerm1.term.toLowerCase()) || 
                !collocation.toLowerCase().includes(definition.definitionTerm2.term.toLowerCase())
            ) {
                phrases.delete(collocation);
                continue;
            }

            for (let name of names) {
                let startIndex = collocation.toLowerCase().search(name);
                let endIndex = startIndex + name.length;
                name = startIndex === 0 ? name + " " : name;
                name = endIndex === collocation.length ? " " + name : name;

                startIndex = definition.definitionTerm1.term.toLowerCase().search(name);
                let term1 = startIndex === 0 ? definition.definitionTerm1.term.toLowerCase() + " " : definition.definitionTerm1.term.toLowerCase();
                term1 = startIndex + name.length === definition.definitionTerm1.term.length ? term1 + " " : term1;

                startIndex = definition.definitionTerm2.term.toLowerCase().search(name);
                let term2 = startIndex === 0 ? definition.definitionTerm2.term.toLowerCase() + " " : definition.definitionTerm2.term.toLowerCase();
                term2 = startIndex + name.length === definition.definitionTerm2.term.length ? term2 + " " : term2;

                if (
                    (collocation.toLowerCase().includes(name) && (name.startsWith(" ") || name.endsWith(" "))) ||
                    (name.includes(term1) && (term1.startsWith(" ") || term1.endsWith(" "))) ||
                    (name.includes(term2) && (term1.startsWith(" ") || term1.endsWith(" ")))
                ) {
                    phrases.delete(collocation);
                    continue loop;
                }
            }
            additionalPhrases.current.set(definition.definitionTerm1.term, { definitionPhrase: {phrase: definition.definitionTerm1.term, definition: definition.definitionTerm1.definition}});
            additionalPhrases.current.set(definition.definitionTerm2.term, { definitionPhrase: {phrase: definition.definitionTerm2.term, definition: definition.definitionTerm2.definition}});
        }
    }, [phraseDefinitions]);

    useEffect(() => {
        let oneeuroX = new OneEuroFilter(1 / 33, 0.0008, 0.001, 2);
        let oneeuroY = new OneEuroFilter(1 / 33, 0.0008, 0.001, 2);
        let rbfchain = new RBFChain(0.01, 0.95, 0.175, 1.0);
        let rbfchainFrame = new RBFChain(0.01, 0.95, 0.665, 1.0);
        let lastTime = null, currentTime = null, dt = null;
        let timeout = null;
        let userCenterRadius = 60 * Math.tan(2.5 * Math.PI/180) * 0.393701 * 127 / 2;

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
                } else {
                    map.get(word).set(index.current, {score: [score]});
                }
            } else {
                map.set(word, new Map().set(index.current, {score: [score]}));
            }
        }

        let test = (event, arg) => {
            currentTime = new Date().getTime();
            dt = currentTime - lastTime;
            lastTime = currentTime;            

            if (dt) {
                let x = oneeuroX.filter(arg.x, currentTime);
                let y = oneeuroY.filter(arg.y, currentTime);
                let nodes = d3.selectAll(".vjs-text-track-cue div span").nodes();

                if (x && y) {
                    // heatmap.addData({ x: x, y: y });

                    let cursor = d3.select("#gazeCursor")
                    .style("width", userCenterRadius * 2 + "px")
                    .style("height", userCenterRadius * 2 + "px")
                    .style("transform", "translate(" + (x  - userCenterRadius) + "px, " + (y - userCenterRadius) + "px)");

                    let input_data = Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
                    let probability = rbfchain.add_element(input_data);
                    let is_fixation = probability >= rbfchain.delta;
                    let probabilityFrame = rbfchainFrame.add_element(input_data);
                    let is_fixationFrame = probabilityFrame >= rbfchainFrame.delta;

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
                        let circle = {x: x, y: y, r: 10};
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
                                    if (complexityMap.has(word)) {
                                        let score = (1 / words.length) * Math.log10(2) * Math.sqrt(dt) * (complexityMap.get(word) / 5) * 1000;
                                        addScores(definitionScores.current, word, score);
                                    }
                                }
                            }
                        }
                        let moreInfobbox = d3.select("#moreInfo").node().getBoundingClientRect();
                        let prevBBox = d3.select("#prev").node().getBoundingClientRect();

                        if (ptInCircle({x: x, y: y, r: userCenterRadius / 2}, {x: moreInfobbox.x + moreInfobbox.width / 2, y: moreInfobbox.y + moreInfobbox.height / 2, r: moreInfobbox.width / 2}) <= 0) {
                            setShowMoreInfo(true);
                            setOnPrev(false);
                        } else if (ptInCircle({x: x, y: y, r: userCenterRadius}, {x: prevBBox.x + prevBBox.width / 2, y: prevBBox.y + prevBBox.height / 2, r: prevBBox.width / 2}) <= 0) {
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
                            let bbox = cursor.node().getBoundingClientRect();
                            let circle = {x: bbox.x + userCenterRadius, y: bbox.y + userCenterRadius, r: userCenterRadius};
                            
                            let player = d3.select("video").node();
                            let playerBBox = player.getBoundingClientRect();
                            let playerArea = playerBBox.x <= x && x <= playerBBox.x + playerBBox.width && playerBBox.y <= y && y <= playerBBox.y + playerBBox.height;

                            for (let wordNode of nodes) {
                                d3.select(wordNode).style("background-color", null);
                                let wordBbox = wordNode.getBoundingClientRect();
                                let text = tokenize.extract(d3.select(wordNode).text(), { toLowercase: true, regex: [tokenize.words] });

                                if (text instanceof Array && playerArea && is_fixation) {
                                    for (let word of text) { 
                                        if (complexityMap.has(word)) {
                                            let frameScore = Math.log10(nodes.length + 1) * Math.sqrt(dt) * (complexityMap.get(word) / 5) * 1000;
                                            addScores(frameScores.current, word, frameScore);
                                        }
                                    }
                                }
                                
                                if (text instanceof Array && is_fixationFrame && rectCircleColliding(circle, wordBbox)) {
                                    let d = Math.pow(wordBbox.x + wordBbox.width / 2 - circle.x, 2) + Math.pow(wordBbox.y + wordBbox.height / 2 - circle.y, 2);

                                    for (let word of text) {                                    
                                        if (complexityMap.has(word)) {
                                            let score = (1 / nodes.length) * Math.log10(2) * Math.sqrt(dt) * (1 / (d + 1)) * (complexityMap.get(word) / 5) * 1000;
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

                    if (!end.current && !onQuestions.current && definitionToggle.current) {
                        if (inAreaOfInterest && document.hasFocus() && paused && !forcePause.current) {
                            if (!timeout) {
                                timeout = setTimeout(() => {
                                    let caption = rawCaptions.current[index.current];

                                    if (definitionToggle.current)
                                        setShowDefinitionContainer(false);
                                    setShowDefinition(null);
                                    setShowMoreInfo(false);
        
                                    if (caption) {
                                        let startTime = caption.data.start / 1000;
                                        setVideoTime(startTime);
                                    } else {
                                        setVideoTime(-1);
                                    }
                                    setPaused(false);
                                    timeout = null;
                                }, 500);
                            }
                        } else if (((!inAreaOfInterest || !document.hasFocus())) || (forcePause.current)) {
                            clearTimeout(timeout);
                            timeout = null;
                            setPaused(true);
    
                            if (document.hasFocus() && !inAreaOfInterest) {
                                if (definitionToggle.current)
                                    setShowDefinitionContainer(true);
                            } else {
                                if (definitionToggle.current)
                                    setShowDefinitionContainer(false);
                                setShowDefinition(null);
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
                    clearInterval(timeout);
                    timeout = null;
                    setPaused(true);
                }
            }
        }
        ipcRenderer.on('gaze-pos', test);

        document.addEventListener("mousemove", (e) => {
            x.current = e.clientX;
            y.current = e.clientY;
        });

        let mouseInterval = setInterval(() => {
            if (mouseEnabled)
                test(null, {x: x.current, y: y.current});
        }, 1000 / 33);
        
        return () => {
            clearInterval(timeout);
            clearInterval(mouseInterval);
            timeout = null;
            ipcRenderer.removeAllListeners();
            d3.select(document).on("mousemove", null);
        }
    }, [paused, mouseEnabled]);

    useEffect(() => {
        setSrc(srcInit);
        setTrack(trackInit);
    }, [srcInit, trackInit]);

    useEffect(() => {
        definitionToggle.current = toggleDefinitions;
        setShowDefinitionContainer(!toggleDefinitions);
    }, [toggleDefinitions]);

    useEffect(() => {
        endCallbackRef.current = endCallback;

        wordScores.current.clear();
        frameScores.current.clear();
        definitionScores.current.clear();
    }, [endCallback]);

    return (
        <>
            <div id={"container"}>
                <Player 
                    clickCallback={clickCallback}
                    timerCallback={timerCallback}
                    endCallback={playerEndCallback}
                    paused={paused}
                    time={videoTime}
                    src={src}
                    track={track}
                    toggleDefinitions={toggleDefinitions}
                />

                <QuestionForm questionData={questionData} endCallback={questionEndCallback} reviewCallback={trim} />
            </div>
            
            <DefinitionsContainer collocations={collocations} show={showDefinitionContainer} showDefinition={showDefinition} showMoreInfo={showMoreInfo} onPrev={onPrev} />
        </>
    );
}
