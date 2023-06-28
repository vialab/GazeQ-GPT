import React from "react";
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
import * as complexityData from "../assets/processedSubtitles/1.json";
import * as phraseDefinitions from "../assets/processedSubtitles/9.json";
import Header from "./Header";
import Player from "./Player";
import QuestionForm from "./QuestionForm";
import videojs from "video.js";

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


export default function Home() {
    let wordScores = new Map();
    let index = 0;
    let rawCaptions = [];
    let [ questionData, setQuestion ] = useState("");
    let complexityMap = JSON.parse(JSON.stringify(complexityData), reviver);
    let phrases = JSON.parse(JSON.stringify(phraseDefinitions), reviver);
    let [paused, setPaused] = React.useState(true);
    let pause = true, forcePause = true, end = false, onQuestions = false;
    let [videoTime, setVideoTime] = React.useState(-1);
    let [ src, setSrc ] = React.useState("file:///src/assets/videos/The_History_of_Chemical_Engineering__Crash_Course_Engineering_5_-_English.mp4");
    let [ track, setTrack ] = React.useState("file:///src/assets/videos/en_The_History_of_Chemical_Engineering__Crash_Course_Engineering_5_-_English.vtt");
    let [ reload, setReload ] = React.useState(false);

    function getCollocation(text) {
        let words = tokenize.extract(text, { toLowercase: true, regex: [tokenize.words, tokenize.numbers] });
        let uniquePhrases = new Set();

        for (let i = 0; i < words.length - 1; i++) {
            let phrase = [words[i]];
            let ifStop = removeStopwords([words[i]])[0];
            
            if (!ifStop) {
                continue;
            }

            for (let j = i; j < words.length - 1; j++) {
                phrase.push(words[j + 1]);
                let ifStop = removeStopwords([phrase[1]])[0];

                if (!ifStop) {
                    phrase = [phrase[0] + " " + phrase[1]];
                    continue;
                }
                phrase = [phrase[0] + " " + phrase[1]];

                if (phrases.has(phrase[0]) && text.toLowerCase().replace(/(?:\r\n|\r|\n)/g, ' ').replace("-", " ").includes(phrase[0])) {
                    let add = true;

                    for (let p of uniquePhrases) {
                        if (phrase[0].includes(p)) {
                            uniquePhrases.delete(p);
                            break;
                        }

                        if (p.includes(phrase[0])) {
                            add = false;
                            break;
                        }
                    }
                    if (add)
                        uniquePhrases.add(phrase[0]);
                }
            }
        }
        return uniquePhrases;
    }
    
    let timerCallback = (t) => {
        index = -1;

        if (t > 0) {
            forcePause = false;
            end = false;
        }

        for (let i = 0; i < rawCaptions.length; i++) {
            let startTime = rawCaptions[i].data.start;
            let endTime = rawCaptions[i].data.end;

            if (t * 1000 >= startTime && t * 1000 <= endTime) {
                index = i;
                break;
            } else if (t * 1000 < startTime) {
                break;
            }
        }

        if (index >= 0 && rawCaptions[index]) {
            // let filteredWords = words.map(word => removeStopwords([word])[0]);
            let subTitle = rawCaptions[index].data.text.toLowerCase().replace(/(?:\r\n|\r|\n)/g, ' ').replace("-", " ");
            let uniquePhrases = getCollocation(rawCaptions[index].data.text);            

            d3.select("#definitionsContainer")
            .selectAll("div")
            .remove();
            
            for (let phrase of uniquePhrases) {
                d3.select("#definitionsContainer")
                .append("div")
                .html("<b>" + phrase + "</b>" + ": " + phrases.get(phrase).definitionPhrase.definition.toLowerCase())
                .style("text-align", "center")
            }
        }
    };

    let playerEndCallback = () => {
        // d3.select("#definitionsContainer")
        // .transition()
        // .duration(500)
        // .style("opacity", 0)
        // .style("right", "-20%")
        // .on("end", () => {
        //     d3.select("#definitionsContainer")
        //     .style("opacity", 0)
        //     .style("right", "-20%")
        // });
        end = true;
        forcePause = true;
        onQuestions = true;

        let sortScores = [];

        for (let [word, scores] of wordScores) {
            for (let [index, score] of scores) {
                sortScores.push({word: word, index: index, wordIndex: score.wordIndex, score: score.score.reduce((a, b) => a + b, 0)});
            }
        }
        sortScores.sort((a, b) => b.score - a.score);
        console.log(sortScores);
        
        let topWords = sortScores;
        let questions = [];
        let collocationQs = [];
        let questionIndex = new Set();
        let questionTime = new Set();
        let questionData = [];

        for (let i = 0; i < topWords.length; i++) {
            let word = topWords[i];

            if (questionIndex.has(word.index)) {
                continue;
            }

            for (let time of questionTime) {
                if (Math.abs(time - rawCaptions[word.index].data.start) < 60000) {
                    continue;
                }
            }
            questionIndex.add(word.index);
            questionTime.add(rawCaptions[word.index].data.start);

            let subtitle = rawCaptions[word.index].data.text.replace(/(?:\r\n|\r|\n)/g, ' ');
            let startTime = rawCaptions[word.index].data.start;
            let endTime = rawCaptions[word.index].data.end;
            let startAllTime = rawCaptions[word.index].data.start;
            let endAllTime = rawCaptions[word.index].data.end;
            
            for (let i = word.index - 1; i >= 0; i--) {
                subtitle = rawCaptions[i].data.text + " " + subtitle;
                startAllTime = rawCaptions[i].data.start;

                if (startTime - rawCaptions[i].data.end > 3000) {
                    break;
                }
            }
            
            for (let i = word.index + 1; i < rawCaptions.length; i++) {
                subtitle += rawCaptions[i].data.text.replace(/(?:\r\n|\r|\n)/g, ' ') + " ";
                endAllTime = rawCaptions[i].data.end;

                if (rawCaptions[i].data.start - endTime > 3000) {
                    break;
                }
            }

            let collocations = getCollocation(subtitle);
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
        for (let i = 0; i < 5; i++) {
            let subtitle = `It could be some new kind of personal water
            purifier, or makeup that lasts as long as you want
            it to, or a revolutionary clothing material.`;
            let collocation = "";

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
                    setQuestion(questions);
                }
                // if (questionData) 
                //     console.log(questionData.arguments);
            });
        }
    };

    let questionEndCallback = () => {
        forcePause = false;
        onQuestions = false;
    };

    let clickCallback = (ifPaused) => {
        forcePause = ifPaused;
    };

    useEffect(() => {
        // let processedWords = 0;
        // let finishedWords = 0;
        // playerEndCallback();

        fetch('file:///src/assets/videos/en_The_History_of_Chemical_Engineering__Crash_Course_Engineering_5_-_English.vtt')
        .then(response => response.text())
        .then(async data => {
            rawCaptions = parseSync(data).filter(n => n.type === "cue");
            // let phraseList = [];

            // for (let i = 0; i < rawCaptions.length; i++) {
            //     let words = tokenize.extract(rawCaptions[i].data.text, { toLowercase: true, regex: [tokenize.words, tokenize.numbers] });
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
            
            // for (let i = 0; i < rawCaptions.length; i++) {
            //     let words = tokenize.extract(rawCaptions[i].data.text, { toLowercase: true, regex: [tokenize.words] });
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
            //         if (typeof score === "number") {
            //             finishedWords += 1;
            //             complexityMap.set(word, score);
    
            //             if (processedWords === finishedWords) {
            //                 console.log(JSON.stringify(complexityMap, replacer));
            //                 console.log(JSON.parse(JSON.stringify(complexityMap, replacer), reviver));
            //             }
            //         } else {
            //             console.log(score);
            //         }
            //     });
            // }
        });

        let heatmap = h337.create({
            container: d3.select("main").node(),
            radius: 60,
        });
        heatmap.setData({min: 0, max: 0, data: []});

        let oneeuroX = new OneEuroFilter(1 / 33, 0.0008, 0.001, 2);
        let oneeuroY = new OneEuroFilter(1 / 33, 0.0008, 0.001, 2);
        let oneeuroFixationX = new OneEuroFilter(1 / 33, 0.0008, 0.001, 2);
        let oneeuroFixationY = new OneEuroFilter(1 / 33, 0.0008, 0.001, 2);
        let rbfchain = new RBFChain(0.01, 0.95, 0.3, 1.0);
        let lastTime = null, currentTime = null, dt = null;
        let timeout = null;
        let userCenterRadius = 60 * Math.tan(2.5 * Math.PI/180) * 0.393701 * 127 / 2;

        ipcRenderer.on('fixation-pos', (event, arg) => {
            let x = oneeuroFixationX.filter(arg.x, arg.timestamp);
            let y = oneeuroFixationY.filter(arg.y, arg.timestamp);

            d3.select("#fixationCursor")
            .style("width", userCenterRadius * 2 + "px")
            .style("height", userCenterRadius * 2 + "px")
            .style("transform", "translate(" + (x  - userCenterRadius) + "px, " + (y - userCenterRadius) + "px)");
        });

        ipcRenderer.on('gaze-pos', (event, arg) => {
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

                    let input_data = Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2))
                    let probability = rbfchain.add_element(input_data)
                    let is_fixation = probability >= rbfchain.delta;

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

                    if (is_fixation) {
                        let bbox = cursor.node().getBoundingClientRect();
                        let circle = {x: bbox.x + userCenterRadius, y: bbox.y + userCenterRadius, r: userCenterRadius};

                        for (let wordNode of nodes) {
                            d3.select(wordNode).style("background-color", null);
                            let wordBbox = wordNode.getBoundingClientRect();
                            let text = tokenize.extract(d3.select(wordNode).text(), { toLowercase: true, regex: [tokenize.words] });
                            
                            if (text instanceof Array && rectCircleColliding(circle, wordBbox)) {
                                let d = Math.pow(wordBbox.x + wordBbox.width / 2 - circle.x, 2) + Math.pow(wordBbox.y + wordBbox.height / 2 - circle.y, 2);
                                let wordIndex = 0;

                                for (let word of text) {                                    
                                    if (complexityMap.has(word)) {
                                        let score = (1 / nodes.length) * Math.log10(2) * Math.sqrt(dt) * (1 / (d + 1)) * (complexityMap.get(word) / 5) * 1000;

                                        if (wordScores.has(word)) {
                                            if (wordScores.get(word).has(index)) {
                                                wordScores.get(word).get(index).score.push(score)
                                            } else {
                                                wordScores.get(word).set(index, {wordIndex: wordIndex, score: [score]});
                                            }
                                        } else {
                                            wordScores.set(word, new Map().set(index, {wordIndex: wordIndex, score: [score]}));
                                        }
                                    }
                                    wordIndex++;
                                }
                            }
                        }
                    }

                    let player = d3.select("video").node();
                    let definitionsContainer = d3.select("#definitionsContainer").node();
                    let playerBBox = player.getBoundingClientRect();
                    let definitionsBBox = definitionsContainer.getBoundingClientRect();
                    let inAreaOfInterest = 
                    // (playerBBox.x <= x && x <= playerBBox.x + playerBBox.width && playerBBox.y <= y && y <= playerBBox.y + playerBBox.height) &&
                    !(window.outerWidth * 0.95 <= x || definitionsBBox.x <= x);

                    if (!end && !onQuestions) {
                        if (inAreaOfInterest && document.hasFocus() && pause && !forcePause) {
                            if (!timeout) {
                                timeout = setInterval(() => {
                                    let caption = rawCaptions[index];
                                    pause = false;
        
                                    d3.select("#definitionsContainer")
                                    .transition()
                                    .style("right", "-20%");
        
                                    if (caption) {
                                        let startTime = caption.data.start / 1000;
                                        setVideoTime(startTime);
                                    } else {
                                        setVideoTime(-1);
                                    }
                                    setPaused(false);
                                }, 500);
                            }
                        } else if (((!inAreaOfInterest || !document.hasFocus()) && !pause) || (forcePause && !pause)) {
                            clearInterval(timeout);
                            timeout = null;
                            setPaused(true);
                            pause = true;
    
                            if (!forcePause && document.hasFocus()) {
                                d3.select("#definitionsContainer")
                                .transition()
                                .style("right", "0%");
                            }
                        }
                    }

                    // for (let wordNode of nodes) {
                    //     let text = tokenize.extract(d3.select(wordNode).text(), { toLowercase: true, regex: [tokenize.words] });

                    //     if (text instanceof Array) {
                    //         for (let word of text) {
                    //             if (wordScores.has(word) && wordScores.get(word).has(index)) {
                    //                 let score = wordScores.get(word).get(index).reduce((a, b) => a + b, 0);
                    //                 let totalScores = [];

                    //                 for (let [_, value1] of wordScores) {
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
                    pause = true;
                }
            }
        });

        return () => {
            d3.select(".heatmap-canvas").remove();
        };
    }, []);

    let trim = (start, end) => {
        let src = videojs("video").src().split("#")[0];

        setSrc(src)
        setSrc(src + "#t=" + start + "," + end);
        setReload(!reload);
        console.log(start + "," + end);
        videojs("video").load();
    }

    return (
        <main>  
            <Header />
            <div id={"container"}>
                <Player 
                    clickCallback={clickCallback}
                    timerCallback={timerCallback}
                    endCallback={playerEndCallback}
                    paused={paused}
                    time={videoTime}
                    src={src}
                    track={track}
                    reload={reload}
                />

                <QuestionForm questionData={questionData} endCallback={questionEndCallback} reviewCallback={trim} />
            </div>
            <div id={"definitionsContainer"}></div>
            <div id={"gazeCursor"}></div>
            <div id={"fixationCursor"}></div>
        </main>  
    );
}
