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

function ptInCircle(pt, circle) {

    const lhs = Math.pow(circle.x - pt.x, 2) + Math.pow(circle.y - pt.y, 2);
    const rhs = Math.pow(circle.r, 2);

    return lhs < rhs ? -1 : (lhs === rhs ? 0 : 1);
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

function getCollocation(text, phrases, secondary = false) {
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
                phrase = [phrase[0] + " " + phrase[1]];
                continue;
            }
            phrase = [phrase[0] + " " + phrase[1]];

            if (phrase[0] !== text && phrases.has(phrase[0]) && text.toLowerCase().replace(/(?:\r\n|\r|\n)/g, ' ').replace("-", " ").includes(phrase[0])) {
                let add = true;
                
                for (let p of uniquePhrases) {
                    if (!secondary)

                        if (phrase[0].includes(p.join(" "))) {
                            uniquePhrases.delete(p);
                            break;
                        }

                    if (!secondary)
                        if (p.join(" ").includes(phrase[0])) {
                            add = false;
                            break;
                        }
                }

                if (add) {
                    uniquePhrases.add([...wordPhrase]);

                    if (secondary) {
                        i += j - i + 1;
                        break;
                    }
                }
            }
        }
    }
    return uniquePhrases;
}

export default function Home({ srcInit, trackInit, complexityData, phraseDefinitions, endCallback, mouseEnabled }) {
    let [ questionData, setQuestion ] = useState("");
    let [ paused, setPaused ] = React.useState(true);
    let [ videoTime, setVideoTime ] = React.useState(-1);
    let [ src, setSrc ] = React.useState(srcInit);
    let [ track, setTrack ] = React.useState(trackInit);
    let [ collocations, setCollocations ] = React.useState(new Map());
    let [ showDefinitionContainer, setShowDefinitionContainer ] = React.useState(false);
    let [ showDefinition, setShowDefinition ] = React.useState(false);
    let [ showMoreInfo, setShowMoreInfo ] = React.useState(false);
    let [ onPrev, setOnPrev ] = React.useState(false);

    let wordScores = useRef(new Map());
    let frameScores = useRef(new Map());
    let definitionScores = useRef(new Map());
    let index = useRef(-1);
    let rawCaptions = useRef([]);
    let forcePause = useRef(true), end = useRef(false), onQuestions = useRef(false);
    let complexityMap = JSON.parse(JSON.stringify(complexityData), reviver);
    let phrases = JSON.parse(JSON.stringify(phraseDefinitions), reviver);
    let x = useRef(0), y = useRef(0);
    
    let timerCallback = (t) => {
        let prevIndex = index.current;
        index.current = -1;

        if (t > 0) {
            end.current = false;
        }

        for (let i = 0; i < rawCaptions.current.length; i++) {
            let startTime = rawCaptions.current[i].data.start;
            let endTime = rawCaptions.current[i].data.end + 500;

            if (t * 1000 >= startTime && t * 1000 <= endTime) {
                index.current = i;
                break;
            } else if (t * 1000 < startTime) {
                break;
            }
        }

        let checkOverlap = (uniquePhrases, secondary) => {            
            for (let i = 0; i < uniquePhrases.length; i++) {
                let prevPhrase = uniquePhrases[i - 1];
                let phrase = uniquePhrases[i];
                let nextPhrase = uniquePhrases[i + 1];

                if (prevPhrase && nextPhrase) {
                    if ((prevPhrase.join(" ") + " " + nextPhrase.join(" ")).includes(phrase.join(" "))) {
                        uniquePhrases.splice(i, 1);
                        i--;
                    }
                }
            }
            return uniquePhrases;
        }

        if (prevIndex !== index.current && index.current >= 0 && rawCaptions.current[index.current]) {
            // let filteredWords = words.map(word => removeStopwords([word])[0]);
            // let subTitle = rawCaptions.current[index.current].data.text.toLowerCase().replace(/(?:\r\n|\r|\n)/g, ' ').replace("-", " ");
            let uniquePhrases = checkOverlap([...getCollocation(rawCaptions.current[index.current].data.text, phrases)]);
            let definitionsList = new Map();
            
            for (let i = 0; i < uniquePhrases.length; i++) {
                let phrase = uniquePhrases[i];
                let definitions = phrases.get(phrase.join(" "));
                let uniqueSecondPhrases = [...getCollocation(phrase.join(" "), phrases, true)];
                let additional = new Map();
                let skipTerm1 = false, skipTerm2 = false;

                for (let secondPhrase of uniqueSecondPhrases) {
                    let secondDefinitions = phrases.get(secondPhrase.join(" "));
                    additional.set(secondPhrase.join(" "), secondDefinitions);

                    if (!skipTerm1 && secondPhrase.includes(definitions.definitionTerm1.term)) {
                        skipTerm1 = true;
                    }

                    if (!skipTerm2 && secondPhrase.includes(definitions.definitionTerm2.term)) {
                        skipTerm2 = true;
                    }
                }
                definitionsList.set(phrase.join(" "), {"collocation": phrase, "definitions": definitions, "additional": additional, "skipTerm1": skipTerm1, "skipTerm2": skipTerm2});
            }
            setCollocations(definitionsList);
        } else if (index.current < 0) {
            setCollocations(new Map());
        }
        setShowDefinition(null);
        setShowMoreInfo(false);
    };

    let playerEndCallback = () => {
        end.current = true;
        forcePause.current = true;
        onQuestions.current = true;

        setShowDefinitionContainer(false);
        setShowMoreInfo(false);
        setShowDefinition(null);

        let sortScores = [];

        for (let [word, scores] of wordScores.current) {
            for (let [index, score] of scores) {
                sortScores.push({word: word, index: index, wordIndex: score.wordIndex, score: score.score.reduce((a, b) => a + b, 0)});
            }
        }
        sortScores.sort((a, b) => b.score - a.score);
        wordScores.current.clear();
        console.log(sortScores);
        
        let topWords = sortScores;
        let questions = [];
        let collocationQs = [];
        let questionData = [];
        let questionIndex = new Set();
        let questionTime = new Set();

        for (let i = 0; i < topWords.length; i++) {
            let word = topWords[i];

            if (questionIndex.has(word.index)) {
                continue;
            }

            for (let time of questionTime) {
                if (Math.abs(time - rawCaptions.current[word.index].data.start) < 60000) {
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
                subtitle = rawCaptions.current[i].data.text + " " + subtitle;
                startAllTime = rawCaptions.current[i].data.start;

                if (startTime - rawCaptions.current[i].data.end > 3000) {
                    break;
                }
            }
            
            for (let i = word.index + 1; i < rawCaptions.current.length; i++) {
                subtitle += rawCaptions.current[i].data.text.replace(/(?:\r\n|\r|\n)/g, ' ') + " ";
                endAllTime = rawCaptions.current[i].data.end;

                if (rawCaptions.current[i].data.start - endTime > 3000) {
                    break;
                }
            }

            let collocations = getCollocation(subtitle, phrases);
            let collocation = word.word;
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
            collocationQs.push(collocation);

            if (collocationQs.length === 5 || (i === topWords.length - 1 && questionTime.size === 0)) {
                break;
            }

            if (i === topWords.length - 1 && collocationQs.length < 4) {
                i = 0;
                questionTime.clear();
            }
            questionData.push({subtitle: subtitle, collocation: collocation, startTime: startAllTime, endTime: endAllTime});
            console.log(collocation);
        }

        // for (let i = 0; i < questionData.length; i++) {
        //     let subtitle = questionData[i].subtitle;
        //     let collocation = questionData[i].collocation;
        for (let i = 0; i < 1; i++) {
            let subtitle = `It could be some new kind of personal water
            purifier, or makeup that lasts as long as you want
            it to, or a revolutionary clothing material.`;
            let collocation = "";

            generateQuestion(subtitle, collocation)
            .then(qData => {
                qData.subtitle = subtitle;
                qData.startTime = Math.random() * 5 + 1;
                qData.endTime = Math.random() * 5 + 6;
                // qData.startTime = questionData[i].startTime / 1000;
                // qData.endTime = questionData[i].endTime / 1000;

                questions.push(qData);
                console.log(qData);

                if (1 === questions.length) {
                    setQuestion(questions);
                }
                // if (questionData) 
                //     console.log(questionData.arguments);
            });
        }
    };

    let questionEndCallback = () => {
        forcePause.current = false;
        onQuestions.current = false;

        if (endCallback instanceof Function) {
            endCallback();
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
            //     let filteredWords = words.map(word => removeStopwords([word])[0]);
            //     let phrase = [];
                
            //     for (let fw of filteredWords) {
            //         if (fw) {
            //             phrase.push(fw);
            //         } else {
            //             if (phrase.length > 1) {
            //                 phraseList.push(phrase);
            //             }
            //             phrase = [];
            //         }
            //     }
            //     if (phrase.length > 1) {
            //         phraseList.push(phrase);
            //     }
            // }
            // console.log(phraseList);
            
            // let testPhraseList = phraseList.slice(1, 2);
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

        let test = (event, arg) => {
            currentTime = new Date().getTime();
            dt = currentTime - lastTime;
            lastTime = currentTime;            

            if (dt) {
                let x = oneeuroX.filter(arg.x, currentTime);
                let y = oneeuroY.filter(arg.y - 0, currentTime);
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
                        let bbox = cursor.node().getBoundingClientRect();
                        let circle = {x: bbox.x + userCenterRadius, y: bbox.y + userCenterRadius, r: 0};
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

                        if (definitionContainer) {
                            let definitionInterest = d3.select(definitionContainer).attr("collocation");
                            let words = JSON.parse(definitionInterest);
                            let wordIndex = 0;

                            for (let word of words) {
                                if (complexityMap.has(word)) {
                                    let score = (1 / words.length) * Math.log10(2) * Math.sqrt(dt) * (complexityMap.get(word) / 5) * 1000;

                                    if (definitionScores.current.has(word)) {
                                        if (definitionScores.current.get(word).has(index.current)) {
                                            definitionScores.current.get(word).get(index.current).score.push(score)
                                        } else {
                                            definitionScores.current.get(word).set(index.current, {wordIndex: wordIndex, score: [score]});
                                        }
                                    } else {
                                        definitionScores.current.set(word, new Map().set(index.current, {wordIndex: wordIndex, score: [score]}));
                                    }
                                }
                                wordIndex++;
                            }
                        }
                        let moreInfobbox = d3.select("#moreInfo").node().getBoundingClientRect();
                        let prevBBox = d3.select("#prev").node().getBoundingClientRect();

                        if (ptInCircle({x: x, y: y}, {x: moreInfobbox.x + moreInfobbox.width / 2, y: moreInfobbox.y + moreInfobbox.height / 2, r: moreInfobbox.width / 2}) <= 0) {
                            setShowMoreInfo(true);
                            setOnPrev(false);
                        } else if (ptInCircle({x: x, y: y}, {x: prevBBox.x + prevBBox.width / 2, y: prevBBox.y + prevBBox.height / 2, r: prevBBox.width / 2}) <= 0) {
                            setOnPrev(true);
                            setShowMoreInfo(false);
                        }
                    }

                    if (is_fixation || is_fixationFrame) {
                        if (is_fixation) {}
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
                                    let wordIndex = 0;

                                    for (let word of text) { 
                                        if (complexityMap.has(word)) {
                                            let frameScore = Math.log10(nodes.length + 1) * Math.sqrt(dt) * (complexityMap.get(word) / 5) * 1000;

                                            if (frameScores.current.has(word)) {
                                                if (frameScores.current.get(word).has(index.current)) {
                                                    frameScores.current.get(word).get(index.current).score.push(frameScore)
                                                } else {
                                                    frameScores.current.get(word).set(index.current, {wordIndex: wordIndex, score: [frameScore]});
                                                }
                                            } else {
                                                frameScores.current.set(word, new Map().set(index.current, {wordIndex: wordIndex, score: [frameScore]}));
                                            }
                                        }
                                        wordIndex++;
                                    }
                                }
                                
                                if (text instanceof Array && is_fixationFrame && rectCircleColliding(circle, wordBbox)) {
                                    let d = Math.pow(wordBbox.x + wordBbox.width / 2 - circle.x, 2) + Math.pow(wordBbox.y + wordBbox.height / 2 - circle.y, 2);
                                    let wordIndex = 0;

                                    for (let word of text) {                                    
                                        if (complexityMap.has(word)) {
                                            let score = (1 / nodes.length) * Math.log10(2) * Math.sqrt(dt) * (1 / (d + 1)) * (complexityMap.get(word) / 5) * 1000;

                                            if (wordScores.current.has(word)) {
                                                if (wordScores.current.get(word).has(index.current)) {
                                                    wordScores.current.get(word).get(index.current).score.push(score)
                                                } else {
                                                    wordScores.current.get(word).set(index.current, {wordIndex: wordIndex, score: [score]});
                                                }
                                            } else {
                                                wordScores.current.set(word, new Map().set(index.current, {wordIndex: wordIndex, score: [score]}));
                                            }
                                        }
                                        wordIndex++;
                                    }
                                }
                            }
                        }
                    }

                    let definitionsContainer = d3.select("#definitionsContainer").node();
                    let definitionsBBox = definitionsContainer.getBoundingClientRect();
                    let inAreaOfInterest = !(window.innerWidth * 0.95 <= x || definitionsBBox.x <= x);

                    if (!end.current && !onQuestions.current) {
                        if (inAreaOfInterest && document.hasFocus() && paused && !forcePause.current) {
                            if (!timeout) {
                                timeout = setTimeout(() => {
                                    let caption = rawCaptions.current[index.current];
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
                                setShowDefinitionContainer(true);
                            } else {
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
                    //                 let score = wordScores.current.get(word).get(index.current).reduce((a, b) => a + b, 0);
                    //                 let totalScores = [];

                    //                 for (let [_, value1] of wordScores.current) {
                    //                     for (let [_, value] of value1) {
                    //                         totalScores.push(value.reduce((a, b) => a + b, 0));
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
                />

                <QuestionForm questionData={questionData} endCallback={questionEndCallback} reviewCallback={trim} />
            </div>
            
            <DefinitionsContainer collocations={collocations} show={showDefinitionContainer} showDefinition={showDefinition} showMoreInfo={showMoreInfo} onPrev={onPrev} />
        </>
    );
}
