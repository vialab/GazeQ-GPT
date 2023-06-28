import React, { useState, useEffect } from "react";
import "../assets/css/QuestionForm.css"
import * as d3 from "d3";

export default function QuestionForm({ questionData, endCallback, reviewCallback }) {
    let [ question, setQuestion ] = useState([]);
    let [ choiceA, setchoiceA ] = useState([]);
    let [ choiceB, setchoiceB ] = useState([]);
    let [ choiceC, setchoiceC ] = useState([]);
    let [ choiceD, setchoiceD ] = useState([]);
    let [ answer, setAnswer ] = useState([]);
    let [ startTime, setStartTime ] = useState([]);
    let [ endTime, setEndTime ] = useState([]);
    let [ subtitle, setSubtitles ] = useState([]);
    let [ index, setIndex ] = useState(0);
    let [ src, setSrc ] = useState("");
    let refA = React.useRef();
    let refB = React.useRef();
    let refC = React.useRef();
    let refD = React.useRef();
    let correct = false;
    let submittedAnswers = new Set();

    let checkChoice = (choice, ref) => {
        if (!correct) {
            if (answer[index].includes(choice) || answer[index].map((a) => a.toLowerCase()).includes(d3.select(ref.current).text().toLowerCase())) {
                submittedAnswers.add(choice);
                
                d3.select(ref.current)
                .style("background-color", "rgba(41, 197, 115, 0.5)")
                .style("color", "white");
                
                if (submittedAnswers.size === answer[index].length) {
                    d3.selectAll(".bottom, .top")
                    .transition()
                    .style("opacity", "1")
                    .style("pointer-events", "all");

                    correct = true;
                    submittedAnswers.clear();
                }
            } else {
                d3.select(ref.current)
                .style("background-color", "rgb(239, 35, 60, 0.5)")
                .style("color", "white");
            }
        }
    }

    let nextHandler = () => {
        correct = false;

        if (index < question.length - 1) {
            setIndex(index + 1);
            d3.selectAll(".bottom, .top")
            .style("opacity", "0")
            .style("pointer-events", "none");

            d3.selectAll(".choice")
            .style("background-color", "white")
            .style("color", "black");
        } else {
            d3.select(".questionContainer")
            .transition()
            .duration(1000)
            .style("width", "0%")
            .style("padding", "0");

            endCallback();
        }
    }

    let trim = () => {
        reviewCallback(startTime[index], endTime[index]);
    }

    useEffect(() => {
        setIndex(0);
        let questions = [], answers = [];
        let choiceAs = [], choiceBs = [], choiceCs = [], choiceDs = [];
        let startTimes = [], endTimes = [];
        let subtitles = [];
        
        d3.selectAll(".bottom, .top")
        .style("opacity", "0")
        .style("pointer-events", "none");

        d3.selectAll(".choice")
        .style("background-color", "white")
        .style("color", "black");

        d3.select(".questionContainer")
        .transition()
        .duration(1000)
        .style("width", "0%");

        let leave = true;

        d3.select(".arrow")
        .on("animationend", () => {
            d3.select(".round")
            .classed("animated", false);

            if (!leave) {
                setTimeout(() => {
                    d3.select(".round")
                    .classed("animated", true);
                }, 100);
            }
        })
          
        d3.select(".round")
        .on("pointerenter", () => {
            leave = false;

            d3.select(".round")
            .classed("animated", true);
        })
        .on("pointerleave", () => {
            leave = true;
        });

        try {
            for (let data of questionData) {
                let parseQuestion = JSON.parse(data.arguments);
                questions.push(parseQuestion.question);
                choiceAs.push(parseQuestion.choiceA);
                choiceBs.push(parseQuestion.choiceB);
                choiceCs.push(parseQuestion.choiceC);
                choiceDs.push(parseQuestion.choiceD);
                answers.push(parseQuestion.answer);
                startTimes.push(data.startTime);
                endTimes.push(data.endTime);
                subtitles.push(data.subtitle.replace(/(?:\r\n|\r|\n)/g, ' '));
            }
        } catch (e) {
            console.log(e);
        };

        if (questions.length > 0) {
            d3.select(".questionContainer")
            .transition()
            .duration(1000)
            .style("width", "25%")
        }

        setQuestion(questions);
        setchoiceA(choiceAs);
        setchoiceB(choiceBs);
        setchoiceC(choiceCs);
        setchoiceD(choiceDs);
        setAnswer(answers);
        setStartTime(startTimes);
        setEndTime(endTimes);
        setSubtitles(subtitles);

        return () => {
            d3.select(".round")
            .on("pointerenter", null)
            .on("pointerleave", null);

            d3.select(".arrow")
            .on("animationend", null);
        }   

    }, [questionData]);

    return (
        <div className={"questionContainer"}>
            <div className={"questionForm"}>
                <div className={"top"}>
                    {/* <p>Taken from:</p>
                    <div className={"subtitle"}>
                        {subtitle[index]}
                    </div> */}
                </div>

                <div className={"question"}>
                    {question[index]}
                </div>

                <div className={"choices"}>
                    <div ref={refA} className={"choice"} onClick={() => checkChoice("A", refA)}>
                        {choiceA[index]}
                    </div>
                    <div ref={refB} className={"choice"} onClick={() => checkChoice("B", refB)}>
                        {choiceB[index]}
                    </div>
                    <div ref={refC} className={"choice"} onClick={() => checkChoice("C", refC)}>
                        {choiceC[index]}
                    </div>
                    <div ref={refD} className={"choice"} onClick={() => checkChoice("D", refD)}>
                        {choiceD[index]}
                    </div>
                </div>

                <div className={"bottom"}>
                    <button className={"round"} onClick={nextHandler}>
                        <div id={"cta"}>
                            <span className={"arrow next primera"}></span>
                            <span className={"arrow next segunda"}></span>
                        </div>
                    </button>

                    <div className={"review"} onClick={trim}>
                        <div>
                            Review the video
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
