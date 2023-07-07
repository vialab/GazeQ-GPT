import React, { useEffect, useRef } from 'react';
import Home from './Home';
import Header from "./Header";
import * as d3 from "d3";
import videojs from 'video.js';
import Modal from 'react-modal';
import "../assets/css/App.css";

import * as complexityData1 from "../assets/processedSubtitles/Complexity_1.json";
import * as phraseDefinitions1 from "../assets/processedSubtitles/Definitions_1.json";
import * as complexityData2 from "../assets/processedSubtitles/Complexity_2.json";
import * as phraseDefinitions2 from "../assets/processedSubtitles/Definitions_2.json";

let videoList = [
    { 
        video: "file:///src/assets/videos/The_History_of_Chemical_Engineering__Crash_Course_Engineering_5_-_English.mp4",
        track: "file:///src/assets/videos/en_The_History_of_Chemical_Engineering__Crash_Course_Engineering_5_-_English.vtt",
        complexityData: complexityData1,
        phraseDefinitions: phraseDefinitions1
    },
    {
        video: "file:///src/assets/videos/The_History_of_Electrical_Engineering__Crash_Course_Engineering_4_-_English.mp4",
        track: "file:///src/assets/videos/en_The_History_of_Electrical_Engineering__Crash_Course_Engineering_4_-_English.vtt",
        complexityData: complexityData2,
        phraseDefinitions: phraseDefinitions2
    },
];

export default function App() {
    let index = useRef(0);
    let gazeRef = useRef(null), fixationRef = useRef(null);

    let [ state, setState ] = React.useState("study");
    let [ src, setSrc ] = React.useState(videoList[index.current].video);
    let [ track, setTrack ] = React.useState(videoList[index.current].track);
    let [ complexityData, setComplexityData ] = React.useState(videoList[index.current].complexityData);
    let [ phraseDefinitions, setPhraseDefinitions ] = React.useState(videoList[index.current].phraseDefinitions);
    let [ enableMouse, setEnableMouse ] = React.useState(true);
    let [ toggleDefinitions, setToggleDefinitions ] = React.useState(state === "study");
    let [ modalIsOpen, setModalIsOpen ] = React.useState(false);
    let [ showDefinitions, setShowDefinitions ] = React.useState(state !== "study");
    let [ modalContent, setModalContent ] = React.useState(null);
    let [ modalBottomContent, setModalBottomContent ] = React.useState(null);
    let [ modalContentIndex, setModalContentIndex ] = React.useState(0);
    let [ pid, setPid ] = React.useState("test");

    
    let preStudyContent = useRef([]);
    
    let toggleGaze = () => {
        if (gazeRef.current)
            d3.select(gazeRef.current)
            .style("display", d3.select(gazeRef.current).style("display") === "none" ? "block" : "none");

        if (fixationRef.current)
            d3.select(fixationRef.current)
            .style("display", d3.select(fixationRef.current).style("display") === "none" ? "block" : "none");
    };

    let toggleMouse = () => {
        setEnableMouse(!enableMouse);

        if (enableMouse) {
            if (gazeRef.current)
                d3.select(gazeRef.current)
                .style("width", "40px")
                .style("height", "40px")
                .style("transform", "translate(0, 0)");

            if (fixationRef.current)
                d3.select(fixationRef.current)
                .style("width", "40px")
                .style("height", "40px")
                .style("transform", "translate(0, 0)");
        }
    };

    let toggleDefinitionContainer = () => {
        setToggleDefinitions(!toggleDefinitions);
    };

    let startStudy = () => {
        setState("study");
        index.current = 0;
        setSrc(videoList[index.current].video);
        setTrack(videoList[index.current].track);
        setComplexityData(videoList[index.current].complexityData);
        setPhraseDefinitions(videoList[index.current].phraseDefinitions);
        setToggleDefinitions(true);
        setShowDefinitions(false);

        // if (enableMouse)
        //     toggleMouse();
        videojs("video").load();
        setModalIsOpen(true);

        d3.select(".questionContainer")
        .transition()
        .duration(1000)
        .style("width", "0%");
    };

    let endVideoCallback = () => {
        if (index.current < videoList.length - 1) {
            index.current++;
            setSrc(videoList[index.current].video);
            setTrack(videoList[index.current].track);
            setComplexityData(videoList[index.current].complexityData);
            setPhraseDefinitions(videoList[index.current].phraseDefinitions);
        } else {
            setState("home");
        }
    };

    let setUp = () => {
        d3.select(".contentContainer")
        .style("opacity", "0")

        let leave = new Map();

        d3.selectAll(".modalButton .arrow")
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
        
        d3.selectAll(".modalButton")
        .each((d, i, n) => {
            leave.set(n[i], true);
        })
        .on("pointerenter", (e) => {
            leave.set(e.srcElement, false);

            d3.select(e.srcElement)
            .classed("animated", true);
        })
        .on("pointerleave", (e) => {
            leave.set(e.srcElement, true);
        });

        let iframe = document.querySelector("iframe");
        let revealContent = () => {
            d3.select(".contentContainer")
            .transition()
            .duration(500)
            .style("opacity", "1")
        };

        if (iframe && iframe.contentDocument) {
            iframe.addEventListener('load', () => {
                console.log("loade")
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

    let prevContent = () => {
        if (modalContentIndex - 1 >= 0) {
            d3.select(".contentContainer")
            .transition()
            .duration(500)
            .style("opacity", "0")
            .on("end", () => {
                setModalContentIndex(modalContentIndex - 1);
                setModalIsOpen(true);
            });
        }
    };

    let nextContent = () => {
        d3.select(".contentContainer")
        .transition()
        .duration(500)
        .style("opacity", "0")
        .on("end", () => {        
            if (modalContentIndex + 1 < preStudyContent.current.length) {
                setModalContentIndex(modalContentIndex + 1);

                if (!preStudyContent.current[modalContentIndex].close) {
                    setModalIsOpen(true);
                } else {
                    setModalIsOpen(false);
                    setShowDefinitions(true);
                    setToggleDefinitions(true);
                }
            } else {
                setModalContentIndex(0);
                setModalIsOpen(false);
                setShowDefinitions(true);
            }
        });
    };

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
                "content": 
                <div>
                    <h3 style={{width: "100%", textAlign: "center"}}>Welcome to the Study</h3>
                    <ul> 
                        <li>Your task is to watch two videos and answer a comphrehension quiz at the end of each video. </li>
                    </ul>
                </div>,
                "prev": true,
            },
            {
                "content": <div>Welcome to the Study</div>,
                "prev": true,
                "close": true,
            },
        ]
    }, [pid]);

    useEffect(() => {
        setUp();
    }, [modalContent]);

    useEffect(() => {
        let nextButton = <button className={"round modalButton nextButton"} onClick={nextContent} key={"next" + modalContentIndex}>
            <div id={"cta"}>
                <span className={"arrow next primera"}></span>
                <span className={"arrow next segunda"}></span>
            </div>
        </button>
        
        let prevButton = <button className={"round modalButton prevButton"} onClick={prevContent} key={"prev" + modalContentIndex}>
            <div id={"cta"}>
                <span className={"arrow next primera"}></span>
                <span className={"arrow next segunda"}></span>
            </div>
        </button>
        
        let bottom = [nextButton]

        if (preStudyContent.current[modalContentIndex].prev) {
            bottom.splice(0, 0, prevButton);
        }

        setModalBottomContent(bottom);
        setModalContent(preStudyContent.current[modalContentIndex].content);
    }, [modalContentIndex, pid]);

    useEffect(() => {
        if (state === "study") {
            let settingContent = <>
                <h3>Settings</h3>
                <div style={{ width: "min-content", display: "flex", "gap": "20px", flexDirection: "column" }}>
                    <div className="field">
                        <input id="pid" name="pid" required defaultValue="test"/>
                        <label htmlFor="pid">Participant ID</label>
                    </div>

                    <div className='settingsContainer'> 
                        <p>Definition Settings</p>
                        <div className='settings'>
                            <div>
                                <input type="radio" id="With Definitions" name="assistance" value="With Definitions" defaultChecked/>
                                <label htmlFor="With Definitions">With Definitions</label>
                            </div>
                            <div>
                                <input type="radio" id="Without Definitions" name="assistance" value="Without Definitions"/>
                                <label htmlFor="Without Definitions">Without Definitions</label>
                            </div>
                        </div>
                    </div>

                    <div className='settingsContainer'> 
                        <p>Video Settings</p>
                        <div className='settings'>
                            <div>
                                <input type="radio" id="1" name="video" value="1" defaultChecked/>
                                <label htmlFor="1">
                                    <div className="Video 1">Video 1</div>
                                    <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"></path></svg>
                                    <div className="Video 2">Video 2</div>
                                </label>
                            </div>
                            <div>
                                <input type="radio" id="2" name="video" value="2"/>
                                <label htmlFor="2">
                                    <div className="Video 2">Video 2</div>
                                    <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"></path></svg>
                                    <div className="Video 1">Video 1</div>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </>

            let prevModalContent, prevModalBottomContent;
            let settingHandler = () => {
                let id = d3.select("input#pid")
                .property("value");

                setPid(id);
                setModalContent(preStudyContent.current[modalContentIndex].content);
                setModalBottomContent(prevModalBottomContent);
            }

            let cancelHandler = () => {
                setModalContent(prevModalContent);
                setModalBottomContent(prevModalBottomContent);
            }

            let bottomContent = [
                <button className={"round modalButton nextButton"} onClick={cancelHandler} key={"settingsCancel"} style={{ borderColor: "#b8405e" }}>
                    <div id={"cta"}>
                        <div className="close-container">
                            <div className="leftright"></div>
                            <div className="rightleft"></div>
                        </div>
                    </div>
                </button>,
                <button className={"round modalButton nextButton"} onClick={settingHandler} key={"settingsConfirm"} style={{ borderColor: "#2eb086" }}>
                    <div id={"cta"}>
                        <svg className="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                            <path className="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
                        </svg>
                    </div>
                </button>,
            ]

            document.addEventListener("keydown", (e) => {
                if (e.key === "y" && e.ctrlKey) {
                    setModalIsOpen(true);
                    setModalContent(settingContent);
                    setModalBottomContent(bottomContent);
                    prevModalContent = modalContent;
                    prevModalBottomContent = modalBottomContent;
                }
            });
        }

        return () => {
            d3.select(document).on("keydown", null);
        }
    }, [state, modalContent, modalBottomContent]);

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
                    <div onClick={toggleMouse}>
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
                onAfterOpen={setUp}
                closeTimeoutMS={1000}
                onRequestClose={() => setModalIsOpen(false)}
            >
                <div className="contentContainer">
                    { modalContent }

                    <div className={"bottom"}>
                        { modalBottomContent }
                    </div>
                </div>
            </Modal>

            <Home
                complexityData={ state === "study" ? complexityData : videoList[index.current].complexityData }
                phraseDefinitions={ state === "study" ? phraseDefinitions : videoList[index.current].phraseDefinitions }
                srcInit={ state === "study" ? src : videoList[index.current].video }
                trackInit={ state === "study" ? track : videoList[index.current].track }
                endCallback={ state === "study" ? endVideoCallback : null }
                mouseEnabled={ enableMouse }
                toggleDefinitions={ toggleDefinitions }
                showDefinitions={ showDefinitions }
            />
            <div id={"gazeCursor"} ref={gazeRef}></div>
            <div id={"fixationCursor"} ref={fixationRef}></div>
        </main>
    );
}