import React, { useEffect, useRef } from 'react';
import Home from './Home';
import Header from "./Header";
import * as d3 from "d3";
import videojs from 'video.js';
import Modal from 'react-modal';
import "../assets/css/App.css";
import { Tooltip } from 'react-tooltip';
import { ImMail4, ImInfo } from "react-icons/im";
import fs from "fs";

import * as complexityData1 from "../assets/processedSubtitles/Complexity_1.json";
import * as complexityData2 from "../assets/processedSubtitles/Complexity_2.json";

import * as phraseDefinitions1 from "../assets/processedSubtitles/t7.json";
import * as phraseDefinitions2 from "../assets/processedSubtitles/t6.json";

import * as questionData1 from "../assets/processedSubtitles/Questions_1.json";
import * as questionData2 from "../assets/processedSubtitles/Questions_2.json";

const video1 = { 
    video: "file:///src/assets/videos/The_History_of_Chemical_Engineering__Crash_Course_Engineering_5_-_English.mp4",
    track: "file:///src/assets/videos/en_The_History_of_Chemical_Engineering__Crash_Course_Engineering_5_-_English.vtt",
    complexityData: complexityData1,
    phraseDefinitions: phraseDefinitions1,
    questions: questionData1
}

const video2 = {
    video: "file:///src/assets/videos/The_History_of_Electrical_Engineering__Crash_Course_Engineering_4_-_English.mp4",
    track: "file:///src/assets/videos/en_The_History_of_Electrical_Engineering__Crash_Course_Engineering_4_-_English.vtt",
    complexityData: complexityData2,
    phraseDefinitions: phraseDefinitions2,
    questions: questionData2
}

let videoList = [
    video1,
    video2,
];

function replacer(_, value) {
    if (value instanceof Map) {
        return {
            dataType: "Map",
            value: Array.from(value.entries()), // or with spread: value: [...value]
        };
    } else {
        return value;
    }
}

export default function App() {
    let index = useRef(0);
    let gazeRef = useRef(null), fixationRef = useRef(null);
    let onSettings = useRef(false);
    let studyState = useRef("preStudy");

    let [ state, setState ] = React.useState("home");
    let [ src, setSrc ] = React.useState(videoList[index.current].video);
    let [ track, setTrack ] = React.useState(videoList[index.current].track);
    let [ complexityData, setComplexityData ] = React.useState(videoList[index.current].complexityData);
    let [ phraseDefinitions, setPhraseDefinitions ] = React.useState(videoList[index.current].phraseDefinitions);
    let [ llm, setLlm ] = React.useState(videoList[index.current].llm);
    let [ questions, setQuestions ] = React.useState(videoList[index.current].questions);
    let [ enableMouse, setEnableMouse ] = React.useState(true);
    let [ toggleDefinitions, setToggleDefinitions ] = React.useState(state === "study");
    let [ modalIsOpen, setModalIsOpen ] = React.useState(false);
    let [ showDefinitions, setShowDefinitions ] = React.useState(state !== "study");
    let [ modalContent, setModalContent ] = React.useState(null);
    let [ modalBottomContent, setModalBottomContent ] = React.useState(null);
    let [ modalContentIndex, setModalContentIndex ] = React.useState(0);
    let [ pid, setPid ] = React.useState("test");
    let [ videoOrder, setVideoOrder ] = React.useState(0);
    let [ ifShowDefinitions, setIfShowDefinitions ] = React.useState(true);
    let [ ifLLmFirst, setIfLLmFirst ] = React.useState(true);
    let [ definitionCallback, setDefinitionCallback ] = React.useState(null);
    let [ definitionContainerCallback, setDefinitionContainerCallback ] = React.useState(null);
    let [ endVideoCallback, setEndVideoCallback ] = React.useState(null);
    let [ ifRecord, setIfRecord ] = React.useState(false);
    let [ recordCallback, setRecordCallback ] = React.useState(() => recordCallbackFunc);
    let [ forcePause, setForcePause ] = React.useState(false);
    
    let preStudyContent = useRef([]);
    let postStudyContent = useRef([]);
    let postTaskContent = useRef([]);
    
    let toggleGaze = () => {
        d3.select(gazeRef.current)
        .style("display", d3.select(gazeRef.current).style("display") === "none" ? "block" : "none");

        d3.select(fixationRef.current)
        .style("display", d3.select(fixationRef.current).style("display") === "none" ? "block" : "none");
    };

    let toggleMouseRef = React.useRef(null);

    useEffect(() => {
        toggleMouseRef.current = () => {
            setEnableMouse(!enableMouse);
    
            if (enableMouse) {
                d3.select(gazeRef.current)
                .style("width", "40px")
                .style("height", "40px")
                .style("transform", "translate(0, 0)");

                d3.select(fixationRef.current)
                .style("width", "40px")
                .style("height", "40px")
                .style("transform", "translate(0, 0)");
            }
        };
    }, [ enableMouse ]);

    let toggleDefinitionContainer = () => {
        setToggleDefinitions(!toggleDefinitions);
    };

    let preToggle = useRef(false);

    let startStudy = () => {
        preToggle.current = toggleDefinitions;
        setState("study");
        index.current = 0;
        studyState.current = "preStudy";
        setSrc(videoList[index.current].video);
        setTrack(videoList[index.current].track);
        setComplexityData(videoList[index.current].complexityData);
        setPhraseDefinitions(videoList[index.current].phraseDefinitions);
        setLlm(videoList[index.current].llm);
        setQuestions(videoList[index.current].questions);
        setToggleDefinitions(true);
        setShowDefinitions(false);
        setVideoOrder(0);
        setIfLLmFirst(true);
        setIfShowDefinitions(true);
        setModalContentIndex(0);
        setEndVideoCallback(() => videoCallback);

        if (d3.select(gazeRef.current).style("display") !== "none")
            toggleGaze();

        if (enableMouse)
            toggleMouseRef.current();
        videojs("video").load();
        setModalIsOpen(true);

        d3.select(".questionContainer")
        .transition()
        .duration(1000)
        .style("width", "0%");
    };

    let videoCallback = () => {
        setShowDefinitions(false);

        if (index.current < videoList.length - 1) {
            index.current++;
            setSrc(videoList[index.current].video);
            setTrack(videoList[index.current].track);
            setLlm(videoList[index.current].llm);
            setQuestions(videoList[index.current].questions);
            setComplexityData(videoList[index.current].complexityData);
            setPhraseDefinitions(videoList[index.current].phraseDefinitions);
        }
        setModalContentIndex(0);
        setModalIsOpen(true);
        setIfRecord(false);

        let player = videojs.getAllPlayers()[0];

        if (player) {
            player.pause();
        }
    };

    let setUp = () => {
        d3.select(".contentContainer")
        .style("opacity", "0")

        let iframe = document.querySelector("iframe");
        let revealContent = () => {
            d3.select(".contentContainer")
            .transition()
            .duration(500)
            .style("opacity", "1")
        };

        if (iframe && iframe.contentDocument) {
            iframe.addEventListener('load', () => {
                revealContent();
            });

            iframe.addEventListener('error', (e) => {
                console.log(e);
                revealContent();
            });
        } else {
            revealContent();
        }
    };

    let setUpButtons = () => {
        let leave = new Map();
        let animationendForward = new Map();
        let animationendReverse = new Map();

        d3.selectAll(".modalButton .arrow")
        .on("animationstart", (e) => {
            animationendForward.set(e.srcElement.closest(".modalButton"), false);
        })
        .on("animationend", (e) => {
            d3.select(e.srcElement.offsetParent)
            .classed("animated", false);

            if (!leave.get(e.srcElement.offsetParent)) {
                setTimeout(() => {
                    d3.select(e.srcElement.offsetParent)
                    .classed("animated", true);
                }, 100);
            }
        })


        d3.selectAll(".modalButton .checkmark .checkmark__check")
        .on("animationstart", (e) => {
            animationendReverse.set(e.srcElement.closest(".modalButton"), false);
        })
        .on("animationend", (e) => {
            if (leave.get(e.srcElement.closest(".modalButton"))) {
                d3.select(e.srcElement.closest(".modalButton"))
                .classed("animated", false);

                d3.select(e.srcElement.closest(".modalButton"))
                .classed("reverse", true);
            }
            animationendForward.set(e.srcElement.closest(".modalButton"), true);
        })

        d3.selectAll(".modalButton .checkmark .checkmark__circle")
        .on("animationstart", (e) => {
            animationendForward.set(e.srcElement.closest(".modalButton"), false);
        })
        .on("animationend", (e) => {
            animationendReverse.set(e.srcElement.closest(".modalButton"), true);

            if (!leave.get(e.srcElement.closest(".modalButton"))) {
                d3.select(e.srcElement.closest(".modalButton"))
                .classed("animated", true);
                
                d3.select(e.srcElement.closest(".modalButton"))
                .classed("reverse", false);
            }
        })

        d3.selectAll(".modalButton .leftright")
        .on("animationstart", (e) => {
            if (e.srcElement.closest(".modalButton").classList.contains("reverse"))
                animationendReverse.set(e.srcElement.closest(".modalButton"), false);
            else
                animationendForward.set(e.srcElement.closest(".modalButton"), false);
        })
        .on("animationend", (e) => {
            if (e.srcElement.closest(".modalButton").classList.contains("reverse"))
                animationendReverse.set(e.srcElement.closest(".modalButton"), true);
            else
                animationendForward.set(e.srcElement.closest(".modalButton"), true);

            if (leave.get(e.srcElement.closest(".modalButton"))) {
                d3.select(e.srcElement.closest(".modalButton"))
                .classed("animated", false);

                d3.select(e.srcElement.closest(".modalButton"))
                .classed("reverse", true);
            } else {
                d3.select(e.srcElement.closest(".modalButton"))
                .classed("animated", true);

                d3.select(e.srcElement.closest(".modalButton"))
                .classed("reverse", false);
            }
        })
        
        d3.selectAll(".modalButton")
        .each((d, i, n) => {
            leave.set(n[i], true);
            animationendForward.set(n[i], true);
            animationendReverse.set(n[i], true);
        })
        .on("pointerenter", (e) => {
            leave.set(e.srcElement, false);

            if (animationendReverse.get(e.srcElement)) {
                d3.select(e.srcElement)
                .classed("animated", true);

                d3.select(e.srcElement)
                .classed("reverse", false);
            }
        })
        .on("pointerleave", (e) => {
            leave.set(e.srcElement, true);
            
            if (animationendForward.get(e.srcElement)) {
                d3.select(e.srcElement)
                .classed("animated", false);

                d3.select(e.srcElement)
                .classed("reverse", true);
            }
        });
    };

    let recordCallbackFunc = (src, data) => {
        let eyeData = data.eyeData;
        let questionData = data.questionData;
        let definitionData = data.definitionData;
        let scoresData = data.scoresData;

        if (eyeData.length > 0 || questionData.length > 0 || definitionData.length > 0 || scoresData.length > 0) {            
            let duplicateNum = 0;
            let videoName = video1.video === src ? "chemical" : "electrical";
            let directory = "./data/" + pid + "_" + videoName;
            
            while (fs.existsSync(directory)) {
                duplicateNum++;
                directory = "./data/" + pid + "_" + videoName + " (" + duplicateNum + ")";
            }
            fs.mkdirSync(directory, { recursive: true });
            let csv = eyeData[0].xOffset + " " + eyeData[0].yOffset + "\nx, y, dt, index, headDistance, radius, timestamp\n";

            eyeData.slice(1 , eyeData.length).forEach((row) => {
                csv += row.x + ", " + row.y + ", " + row.dt + ", " + row.index + ", " + row.headDistance + ", " + row.radius + ", " + row.timestamp + "\n";
            });

            fs.writeFileSync(directory + "/eyeData.csv", csv);
            fs.writeFileSync(directory + "/questionData.json", JSON.stringify(questionData, replacer));
            fs.writeFileSync(directory + "/definitionData.json", JSON.stringify(definitionData, replacer));
            fs.writeFileSync(directory + "/scoresData.json", JSON.stringify(scoresData, replacer));
        }
    }

    let prevContent = (e) => {
        if (modalContentIndex - 1 >= 0) {
            d3.select(e.target.closest(".modalButton"))
            .style("pointer-events", "none");

            d3.select(".contentContainer")
            .transition()
            .duration(500)
            .style("opacity", "0")
            .on("end", () => {
                if (modalContentIndex - 1 < preStudyContent.current.length) {
                    setModalContentIndex(modalContentIndex - 1);
                } else {
                    setModalContentIndex(preStudyContent.current.length - 1);
                }
                setModalIsOpen(true);
            });
        }
    };
    let nextContent = useRef(null);

    useEffect(() => {
        nextContent.current = (e) => {
            d3.select(e.target.closest(".modalButton"))
            .style("pointer-events", "none");

            d3.select(".contentContainer")
            .transition()
            .duration(500)
            .style("opacity", "0")
            .on("end", () => {
                setModalContentIndex(modalContentIndex + 1);
            });
        };
    }, [modalContentIndex]);

    useEffect(() => {
        preStudyContent.current = [
            {
                "content": <>
                    <h3 style={{width: "100%", textAlign: "center"}}>Pre Study Questionnaire</h3>
                    <iframe src={"https://docs.google.com/forms/d/e/1FAIpQLSfZgJz4b0MjiIblc-hrb4QKoZvQ0S0J9Ddw0xHgqxENAUMQRA/viewform?usp=pp_url&entry.1500102265=" + pid} />
                </>,
                "prev": false,
            },
            {
                "content": <div style={{ textAlign: "center" }}>
                    Have you submitted the questionnaire?
                </div>,
                "prev": true,
                "confirm": true,
                "disableNext": true,
                "callback": () => {
                    setTimeout(() => {
                        d3.select(".modalButton.disabled")
                        .classed("enable", true)
                    }, 1000);
                },
            },
            {
                "content": 
                <div>
                    <h3 style={{width: "100%", textAlign: "center"}}>Welcome to the Study</h3>
                    <ul> 
                        <li style={{ margin: "30px 0px" }}>Your task is to watch two videos and answer a comphrehension quiz at the end of each video.</li>
                        <li style={{ margin: "30px 0px" }}>You are able to pause the video.</li>
                        <li style={{ margin: "30px 0px" }}>You are able to rewatch parts of the video by navigating with the progress bar or clicking arrow keys.</li>
                    </ul>
                </div>,
                "prev": true,
                "callback": () => {
                    d3.select("html").on("keydown", null);
                    
                    if (d3.select(gazeRef.current).style("display") !== "none")
                        toggleGaze();
                }
            },
            {
                "content": <>
                    <h3 style={{width: "100%", textAlign: "center"}}>Please look at the white dots to ensure the gaze point matches.</h3>
                    <h3 style={{width: "100%", textAlign: "center"}}>Use the arrow keys to correct it.</h3>
                    <div className='calibrateScreen'>
                        <span style={{ top: "10%", left: "50%" }}></span>
                        <span style={{ bottom: "10%", right: "10%" }}></span>
                        <span style={{ bottom: "10%", right: "90%" }}></span>
                    </div>
                </>,
                "prev": true,
                "callback": () => {
                    if (d3.select(gazeRef.current).style("display") === "none")
                        toggleGaze();

                    d3.select("html").on("keydown", (e) => {
                        let xOffset = new Number(d3.select("#gazeCursor").attr("xoffset"));
                        let yOffset = new Number(d3.select("#gazeCursor").attr("yoffset"));

                        if (e.code === "ArrowUp") {
                            d3.select("#gazeCursor").attr("yoffset", yOffset - 1)
                        } else if (e.code === "ArrowDown") {
                            d3.select("#gazeCursor").attr("yoffset", yOffset + 1)
                        } else if (e.code === "ArrowLeft") {
                            d3.select("#gazeCursor").attr("xoffset", xOffset - 1)
                        } else if (e.code === "ArrowRight") {
                            d3.select("#gazeCursor").attr("xoffset", xOffset + 1)
                        }
                    });
                },
            },
        ]
        
        if (ifShowDefinitions) {
            preStudyContent.current.push(
                {
                    "content": <div style={{ textAlign: "center" }}>
                        <h3 style={{width: "100%", textAlign: "center"}}>Definition Panel</h3>
                        <div style={{ textAlign: "start", display: "flex", justifyContent: "center", alignItems: "center" }}>
                            <ul>
                                <li style={{ margin: "30px 0px" }}> During the video, if you need definitions for any of the phrases in the subtitle.</li>
                                <li style={{ margin: "30px 0px" }}> You can look to the right of the screen to open the definition panel.</li>
                                <li style={{ margin: "30px 0px" }}> The video will automatically pause once you open the definition panel and play once you close it.</li>
                            </ul>
                        <video width={"60%"} src="file:///src/assets/tutorial.mkv" autoPlay loop style={{ margin: "0 20px", borderRadius: "10px" }}></video> 
                        </div>
                    </div>,
                    "prev": true,
                    "callback": () => {
                        if (d3.select(gazeRef.current).style("display") !== "none")
                            toggleGaze();

                        d3.select("html").on("keydown", null);
                        setDefinitionCallback(null);
                        setDefinitionContainerCallback(null);
                        setShowDefinitions(false);

                        let player = videojs.getAllPlayers()[0];

                        if (player) {
                            player.currentTime(0);
                            player.pause();
                            player.trigger("reset");
                        }
                    },
                },
            );

            preStudyContent.current.push(
                {
                    "content":
                    <>
                        <h3 style={{width: "100%", textAlign: "center"}}>Practice the following tasks to continue</h3>
                        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "20px" }}>
                            <div className="checklistItem" id="definitionPanel">
                                <div className="check"></div> Open the definition panel
                            </div>
                            <div className="checklistItem" id="showDefinition">
                                <div className="check"></div> Read one of the definitions
                            </div>
                            {/* <div className="checklistItem" id="moreInfo">
                                <div className="check"></div> Open the "more info" section
                            </div>
                            <div className="checklistItem" id="prev">
                                <div className="check"></div> Close the "more info" section
                            </div> */}
                        </div>
                    </>,
                    "prev": true,
                    "close": true,
                    "disableNext": true,
                    "callback": () => {
                        let player = videojs.getAllPlayers()[0];

                        if (player) {
                            player.currentTime(30);
                            player.pause();
                        }
                        setShowDefinitions(true);
                        setToggleDefinitions(true);
                        setDefinitionCallback(() => (collocation, definition, element, type) => {
                            if (type === "collocation") {
                                d3.select("#showDefinition .check")
                                .classed("checked", true);
                            } else if (type === "moreInfo") {
                                d3.select("#moreInfo .check")
                                .classed("checked", true);
                            } else if (type === "prev") {
                                d3.select("#prev .check")
                                .classed("checked", true);
                            }

                            if (d3.selectAll(".check").nodes().filter(d => !d.classList.contains("checked")).length === 0) {   
                                d3.select(".modalButton.disabled")
                                .classed("enable", true)
                            }
                        });
                        setDefinitionContainerCallback(() => (open) => {
                            if (open) {
                                d3.select("#definitionPanel .check")
                                .classed("checked", true);
                            }
                        })
                    },
                    "nextCallback": () => {
                        setDefinitionCallback(null);
                        setDefinitionContainerCallback(null);
                    }
                },
            );
        } else {
            setShowDefinitions(false);
        }

        postTaskContent.current = [
            {
                "content": <>
                    <h3 style={{width: "100%", textAlign: "center"}}>Post Task Questionnaire</h3>
                    <iframe key={"postTask"} src={"https://docs.google.com/forms/d/e/1FAIpQLScjP-2OyizphPnLQjbooTBZBYg0FN3S06PHi9HtS0sTSVdUug/viewform?usp=pp_url&entry.1556758825=" + pid} />
                </>,
                "prev": false,
            },
            {
                "content": <div style={{ textAlign: "center" }}>
                    Have you submitted the questionnaire?
                </div>,
                "prev": true,
                "confirm": true,
                "disableNext": true,
                "callback": () => {
                    setTimeout(() => {
                        d3.select(".modalButton.disabled")
                        .classed("enable", true)
                    }, 1000);
                },
                "nextCallback": () => {
                    setShowDefinitions(ifShowDefinitions);
                },
            },
        ]

        postStudyContent.current = [
            {
                "content": <>
                    <h3 style={{width: "100%", textAlign: "center"}}>Post Task Questionnaire</h3>
                    <iframe key={"postTask"} src={"https://docs.google.com/forms/d/e/1FAIpQLScjP-2OyizphPnLQjbooTBZBYg0FN3S06PHi9HtS0sTSVdUug/viewform?usp=pp_url&entry.1556758825=" + pid} />
                </>,
                "prev": false,
            },
            {
                "content": <>
                    <h3 style={{width: "100%", textAlign: "center"}}>Post Study Questionnaire</h3>
                    <iframe key={"postStudy"} src={"https://docs.google.com/forms/d/e/1FAIpQLSekva_HDgGjrpaigGVI1W5O4LNaiUNFnjaZ4NPFdzwep0cwFQ/viewform?usp=pp_url&entry.377591269=" + pid + "&entry.1353774704=" + (ifShowDefinitions ? "With+Definitions" : "Without+Definitions")} />
                </>,
                "prev": true,
            },
            {
                "content": <div style={{ textAlign: "center" }}>
                    Have you submitted the questionnaires?
                </div>,
                "prev": true,
                "confirm": true,
                "disableNext": true,
                "callback": () => {
                    setTimeout(() => {
                        d3.select(".modalButton.disabled")
                        .classed("enable", true)
                    }, 1000);
                },
                "nextCallback": () => {
                    setState("home");
                    setEndVideoCallback(null);
                    setIfRecord(false);
                    setShowDefinitions(true);
                    setToggleDefinitions(preToggle.current);
                }
            },
        ]

        let content;

        switch (studyState.current) {
            case "preStudy":
                content = preStudyContent.current;
                break;
            case "postTask":
                content = postTaskContent.current;
                break;
            case "postStudy":
                content = postStudyContent.current;
                break;
        }

        if (modalContentIndex >= content.length) {
            setModalContentIndex(content.length - 1);
        }
    }, [pid, ifShowDefinitions]);

    useEffect(() => {
        if (videoOrder === 0) {
            videoList[0] = video1;
            videoList[1] = video2;
        } else {
            videoList[0] = video2;
            videoList[1] = video1;
        }

        if (ifLLmFirst) {
            videoList[0].llm = true;
            videoList[1].llm = false;
        } else {
            videoList[0].llm = false;
            videoList[1].llm = true;
        }
        setSrc(videoList[index.current].video);
        setTrack(videoList[index.current].track);
        setQuestions(videoList[index.current].questions);
        setComplexityData(videoList[index.current].complexityData);
        setPhraseDefinitions(videoList[index.current].phraseDefinitions);
        setLlm(videoList[index.current].llm);
    }, [videoOrder, ifLLmFirst]);

    useEffect(() => {
        setForcePause(modalIsOpen);
    }, [modalIsOpen]);

    useEffect(() => {
        setUp();
    }, [modalContent]);

    useEffect(() => {
        setUpButtons();
    }, [modalBottomContent]);

    useEffect(() => {
        let content;

        switch (studyState.current) {
            case "preStudy":
                content = preStudyContent.current;
                break;
            case "postTask":
                content = postTaskContent.current;
                break;
            case "postStudy":
                content = postStudyContent.current;
                break;
        }

        if (modalContentIndex < content.length) {
            setModalContent(content[modalContentIndex].content);
            
            if (!onSettings.current) {
                let nextButton = <button className={"round modalButton nextButton" + (content[modalContentIndex].disableNext ? " disabled" : "") + (content[modalContentIndex].confirm ? " confirm" : "")} onClick={nextContent.current} key={"next" + modalContentIndex}>
                    <div id={"cta"}>
                        { content[modalContentIndex].confirm ? 
                            <svg className="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                                <path className="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
                                <circle r="13" fill="none" stoke="white" cx="50%" cy="50%" className="checkmark__circle" />
                            </svg>
                            :
                            <>
                                <span className={"arrow next primera"}></span>
                                <span className={"arrow next segunda"}></span>
                            </>
                        }
                    </div>
                </button>
                
                let prevButton = <button className={"round modalButton prevButton"+ (content[modalContentIndex].confirm ? " cancel" : "")} onClick={prevContent} key={"prev" + modalContentIndex}>
                    <div id={"cta"}>
                        { content[modalContentIndex].confirm ?
                            <div className="close-container">
                                <div className="leftright"></div>
                                <div className="rightleft"></div>
                            </div> :
                            <>
                                <span className={"arrow next primera"}></span>
                                <span className={"arrow next segunda"}></span>
                            </>
                        }
                    </div>
                </button>
                
                let bottom = [nextButton]

                if (content[modalContentIndex].prev) {
                    bottom.splice(0, 0, prevButton);
                }
                
                if (content[modalContentIndex].callback instanceof Function)
                    content[modalContentIndex].callback();
                setModalBottomContent(bottom);
            }
        } else {
            setModalIsOpen(false);
            setShowDefinitions(ifShowDefinitions);
            setDefinitionCallback(null);
            setDefinitionContainerCallback(null);
            setIfRecord(true);
            
            let player = videojs.getAllPlayers()[0];

            if (player) {
                player.currentTime(0);
                
                setTimeout(() => {
                    player.trigger("reset");
                }, 1000);
            }
            if (d3.select("#gazeCursor").style("display") !== "none")
                toggleGaze();

            if (index.current < videoList.length - 1) {
                studyState.current = "postTask";
            } else {
                studyState.current = "postStudy";
            }
            
            if (content[modalContentIndex - 1].nextCallback instanceof Function) {
                content[modalContentIndex - 1].nextCallback();
            }
        }
    }, [modalContentIndex, pid]);

    useEffect(() => {
        if (state === "study" && !onSettings.current) {
            let settingContent = <>
                <h3>Settings</h3>
                <div style={{ width: "min-content", display: "flex", gap: "20px", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
                    <div className="field">
                        <input id="pid" name="pid" required defaultValue={pid}/>
                        <label htmlFor="pid">Participant ID</label>
                    </div>

                    <div className='settingsContainer'> 
                        <p>Definition Settings</p>
                        <div className='settings'>
                            <div>
                                <input type="radio" id="With Definitions" name="assistance" value="With Definitions" defaultChecked={ifShowDefinitions}/>
                                <label htmlFor="With Definitions">With Definitions</label>
                            </div>
                            <div>
                                <input type="radio" id="Without Definitions" name="assistance" value="Without Definitions" defaultChecked={!ifShowDefinitions}/>
                                <label htmlFor="Without Definitions">Without Definitions</label>
                            </div>
                        </div>
                    </div>

                    <div className='settingsContainer'> 
                        <p>Video Settings</p>
                        <div className='settings'>
                            <div>
                                <input type="radio" id="0" name="video" value="0" defaultChecked={videoOrder === 0}/>
                                <label htmlFor="0">
                                    <div className="Video 1">Video 1</div>
                                    <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"></path></svg>
                                    <div className="Video 2">Video 2</div>
                                </label>
                            </div>
                            <div>
                                <input type="radio" id="1" name="video" value="1" defaultChecked={videoOrder !== 0}/>
                                <label htmlFor="1">
                                    <div className="Video 2">Video 2</div>
                                    <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"></path></svg>
                                    <div className="Video 1">Video 1</div>
                                </label>
                            </div>
                        </div>
                    </div>

                    <div className='settingsContainer'> 
                        <p>LLM Settings</p>
                        <div className='settings'>
                            <div>
                                <input type="radio" id="llmFirst" name="llmQs" value="llmFirst" defaultChecked={ifLLmFirst}/>
                                <label htmlFor="llmFirst">LLM Qs First</label>
                            </div>
                            <div>
                                <input type="radio" id="llmSecond" name="llmQs" value="llmSecond" defaultChecked={!ifLLmFirst}/>
                                <label htmlFor="llmSecond">LLM Qs Second</label>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "20px" }}> 
                        <p>Toggle Gaze</p>
                        <label className="switch"><input type="checkbox" defaultChecked={d3.select(gazeRef.current).style("display") !== "none"} onChange={toggleGaze}/><span className="slider sliderRound"></span></label>
                        <p>Enable Mouse</p>
                        <label className="switch"><input type="checkbox" defaultChecked={enableMouse} onChange={() => toggleMouseRef.current()}/><span className="slider sliderRound"></span></label>
                    </div>
                </div>
            </>
            let prevModalContent = modalContent, prevModalBottomContent = modalBottomContent;
            let ifModalOpen = modalIsOpen;
            
            let settingHandler = () => {
                d3.select(".contentContainer")
                .transition()
                .duration(500)
                .style("opacity", "0")
                .on("end", () => {
                    let id = d3.select("input#pid").property("value");
                    let ifShowDefinition = d3.select("input[name='assistance']:checked").property("value") === "With Definitions";
                    let ifLLmFirst = d3.select("input[name='llmQs']:checked").property("value") === "llmFirst";
                    let videoOrder = d3.select("input[name='video']:checked").property("value");

                    setModalIsOpen(ifModalOpen);
                    setPid(id);
                    setRecordCallback(() => recordCallbackFunc);
                    setModalContent(prevModalContent);
                    setModalBottomContent(prevModalBottomContent);
                    setVideoOrder(videoOrder === "1" ? 1 : 0);
                    setIfShowDefinitions(ifShowDefinition);
                    setIfLLmFirst(ifLLmFirst);
                    onSettings.current = false;

                    if (!modalIsOpen) {
                        setShowDefinitions(ifShowDefinition);
                    }
                });
            }
            
            let cancelHandler = () => {
                d3.select(".contentContainer")
                .transition()
                .duration(500)
                .style("opacity", "0")
                .on("end", () => {
                    onSettings.current = false;
                    setModalContent(prevModalContent);
                    setModalBottomContent(prevModalBottomContent);
                    setModalIsOpen(ifModalOpen);
                });
            }

            let bottomContent = [
                <button className={"round modalButton nextButton cancel"} onClick={cancelHandler} key={"settingsCancel"}>
                    <div id={"cta"}>
                        <div className="close-container">
                            <div className="leftright"></div>
                            <div className="rightleft"></div>
                        </div>
                    </div>
                </button>,
                <button className={"round modalButton nextButton confirm"} onClick={settingHandler} key={"settingsConfirm"}>
                    <div id={"cta"}>
                        <svg className="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                            <path className="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
                            <circle r="13" fill="none" stoke="white" cx="50%" cy="50%" className="checkmark__circle" />
                        </svg>
                    </div>
                </button>,
            ]

            d3.select(document).on("keydown", (e) => {
                if (e.key === "y" && e.ctrlKey && !onSettings.current) {
                    setModalIsOpen(true);
                    
                    if (d3.select(".contentContainer").node()) {
                        d3.select(".contentContainer")
                        .transition()
                        .duration(500)
                        .style("opacity", "0")
                        .on("end", () => {
                            onSettings.current = true;
                            setModalContent(settingContent);
                            setModalBottomContent(bottomContent);
                        });
                    } else {
                        onSettings.current = true;
                        setModalContent(settingContent);
                        setModalBottomContent(bottomContent);
                    }
                }
            });
        }

        return () => {
            if (!onSettings.current)
                d3.select(document).on("keydown", null);
        }
    }, [state, modalContent, modalBottomContent, modalIsOpen, pid]);

    useEffect(() => {
        if (state === "study") {
            startStudy();
        }
    }, []);
    
    return (
        <main>
            { state === "home" ?
                <Header>
                    <div onClick={toggleGaze}>
                        Toggle Gaze
                    </div>
                    <div onClick={() => toggleMouseRef.current()}>
                        Toggle Mouse
                    </div>
                    <div onClick={toggleDefinitionContainer}>
                        Toggle Definitions
                    </div>
                    <div onClick={startStudy}>
                        Start Study
                    </div>
                </Header>
                : null
            }
            
            <Modal
                isOpen={modalIsOpen}
                className="modal"
                overlayClassName="overlay"
                appElement={document.getElementById('root')}
                onAfterOpen={() => {setUp(); setUpButtons();}}
                closeTimeoutMS={1000}
                onRequestClose={() => setModalIsOpen(false)}
                shouldCloseOnEsc={false}
                shouldFocusAfterRender={true}
                shouldCloseOnOverlayClick={false}
            >
                <div className="contentContainer">
                    <div className="studyInfo" data-tooltip-id="my-tooltip">?</div>
                    { modalContent }

                    <div className={"bottom"}>
                        { modalBottomContent }
                    </div>
                </div>
                <Tooltip id="my-tooltip" openOnClick closeOnEsc closeOnResize place='bottom-end'>
                    <div style={{ display: "flex", flexDirection: "column", fontFamily: "Raleway", fontSize: "1em", userSelect: "none" }}>
                        <span>
                            <b>Project Title:</b>
                        </span>
                        <span style={{ paddingLeft: "10px" }}> Gaze-Aware Automatic Question Generation </span>
                        <span style={{ paddingLeft: "10px" }}> To Increase Comprehension </span>
                        <span style={{ paddingLeft: "10px" }}> On Technical/Expert Videos using LLMs </span>
                        <span style={{ paddingTop: "10px" }}>
                            <b>REB File #:</b>
                        </span>
                        <span style={{ paddingLeft: "10px" }}> 16168 </span>
                        <span style={{ paddingTop: "10px" }}>
                            <b>Supervisors:</b>
                        </span>
                        <span style={{ paddingLeft: "10px", marginBottom: "5px", display: "flex", gap: "5px", alignItems: "center", height: "1.3em" }}>
                            Christopher Collins
                            <a style={{ display: "contents", color: "black" }} href="mailto: christopher.collins@ontariotechu.ca">
                                <ImMail4 style={{ width: "auto", height: "100%", cursor: "pointer", pointerEvents: "visible", color: "white" }} />
                            </a>
                            <a style={{ display: "contents", color: "black" }} href="https://vialab.ca/team/christopher-collins" target="_blank" rel="noreferrer">
                                <ImInfo style={{ width: "auto", height: "100%", cursor: "pointer", pointerEvents: "visible", color: "white" }} />
                            </a>
                        </span>
                        <span style={{ paddingLeft: "10px", display: "flex", gap: "5px", alignItems: "center", height: "1.3em" }}>
                            Mariana Shimabukuro
                            <a style={{ display: "contents", color: "black" }} href="mailto: mariana.shimabukuro@ontariotechu.ca">
                                <ImMail4 style={{ width: "auto", height: "100%", cursor: "pointer", pointerEvents: "visible", color: "white" }} />
                            </a>
                            <a style={{ display: "contents", color: "black" }} href="https://vialab.ca/team/mariana-shimabukuro" target="_blank" rel="noreferrer">
                                <ImInfo style={{ width: "auto", height: "100%", cursor: "pointer", pointerEvents: "visible", color: "white" }} />
                            </a>
                        </span>
                        <span style={{ paddingTop: "10px" }}>
                            <b>Lab:</b>
                        </span>
                        <span style={{ paddingLeft: "10px" }}> <a href="https://vialab.ca" target="_blank" rel="noreferrer" style={{ pointerEvents:"all", color: "white" }}>Vialab</a> (Ontario Tech University, UA 4150) </span>
                    </div>
                </Tooltip>
            </Modal>

            <Home
                complexityData={ state === "study" ? complexityData : videoList[index.current].complexityData }
                phraseDefinitions={ state === "study" ? phraseDefinitions : videoList[index.current].phraseDefinitions }
                srcInit={ state === "study" ? src : videoList[index.current].video }
                trackInit={ state === "study" ? track : videoList[index.current].track }
                llm={ state === "study" ? llm : true }
                questions={ state === "study" ? questions : videoList[index.current].questions }
                endCallback={ endVideoCallback }
                definitionCallback={ definitionCallback }
                definitionContainerCallback={ definitionContainerCallback }
                forcePause={ forcePause }
                mouseEnabled={ enableMouse }
                toggleDefinitions={ toggleDefinitions }
                showDefinitions={ showDefinitions }
                record = { ifRecord }
                recordCallback = { recordCallback }
            />
            <div id={"gazeCursor"} ref={gazeRef} xoffset={0} yoffset={0}></div>
            <div id={"fixationCursor"} ref={fixationRef}></div>
        </main>
    );
}