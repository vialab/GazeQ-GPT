import React, { useRef } from 'react';
import Home from './Home';
import Header from "./Header";
import * as d3 from "d3";
import videojs from 'video.js';

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
    let index = useRef(1);
    let gazeRef = useRef(null), fixationRef = useRef(null);

    let [ state, setState ] = React.useState("home");
    let [ src, setSrc ] = React.useState(videoList[index.current].video);
    let [ track, setTrack ] = React.useState(videoList[index.current].track);
    let [ complexityData, setComplexityData ] = React.useState(videoList[index.current].complexityData);
    let [ phraseDefinitions, setPhraseDefinitions ] = React.useState(videoList[index.current].phraseDefinitions);
    let [ enableMouse, setEnableMouse ] = React.useState(true);
    let [ toggleDefinitions, setToggleDefinitions ] = React.useState(false);
    
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

        if (enableMouse)
            toggleMouse();
        videojs("video").load();

        d3.select(".questionContainer")
        .transition()
        .duration(1000)
        .style("width", "0%")
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
              
            <Home
                complexityData={ state === "study" ? complexityData : videoList[index.current].complexityData }
                phraseDefinitions={ state === "study" ? phraseDefinitions : videoList[index.current].phraseDefinitions }
                srcInit={ state === "study" ? src : videoList[index.current].video }
                trackInit={ state === "study" ? track : videoList[index.current].track }
                endCallback={ state === "study" ? endVideoCallback : null }
                mouseEnabled={ enableMouse }
                toggleDefinitions={ toggleDefinitions }
            />
            <div id={"gazeCursor"} ref={gazeRef}></div>
            <div id={"fixationCursor"} ref={fixationRef}></div>
        </main>
    );
}