import React, { useState, useEffect } from "react";
import "../assets/css/QuestionForm.css"
import * as d3 from "d3";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faThumbsUp, faThumbsDown } from "@fortawesome/free-solid-svg-icons";
import { Textfit } from 'react-textfit';

export default function QuestionForm({ questionData, questionCallback, endCallback, reviewCallback }) {
    let [ question, setQuestion ] = useState([]);
    let [ choiceA, setchoiceA ] = useState([]);
    let [ choiceB, setchoiceB ] = useState([]);
    let [ choiceC, setchoiceC ] = useState([]);
    let [ choiceD, setchoiceD ] = useState([]);
    let [ answer, setAnswer ] = useState([]);
    let [ startTime, setStartTime ] = useState([]);
    let [ endTime, setEndTime ] = useState([]);
    let [ explanation, setExplanation ] = useState([]);
    let [ subtitle, setSubtitles ] = useState([]);
    let [ index, setIndex ] = useState(0);
    let [ displayExplanation, setDisplayExplanation ] = useState(null);
    
    let refA = React.useRef();
    let refB = React.useRef();
    let refC = React.useRef();
    let refD = React.useRef();
    let startTimeRef = React.useRef();
    let correct = false;
    let submittedAnswers = React.useRef(new Set());

    let checkChoice = (choice, ref) => {
        if (!correct) {
            submittedAnswers.current.add(choice);
            
            if (answer[index].toLowerCase() === choice.toLowerCase() || answer[index].toLowerCase().includes(d3.select(ref.current).text().toLowerCase())) {                
                d3.select(ref.current)
                .style("background-color", "rgba(41, 197, 115, 0.5)")
                .style("color", "white")
                .style("pointer-events", "none");
                
                d3.select(".questionForm")
                .selectAll(".rating")
                .transition()
                .style("opacity", "1")
                .style("pointer-events", "all");

                d3.selectAll([refA.current, refB.current, refC.current, refD.current])
                .style("pointer-events", "none");

                correct = true;

                d3.selectAll(".top")
                .transition()
                .style("opacity", "1");
                
                if (explanation[index])
                    setDisplayExplanation(explanation[index][choice]);
            } else {
                d3.select(ref.current)
                .style("background-color", "rgb(239, 35, 60, 0.5)")
                .style("color", "white");
                
                if (explanation[index])
                    setDisplayExplanation(explanation[index][choice]);

                d3.selectAll(".top")
                .transition()
                .style("opacity", "1");
            }
        }
    }

    let handleRating = (like) => {
        if (like) {
            d3.select(".like")
            .classed("active", true);

            d3.select(".dislike")
            .classed("active", false);
        } else {
            d3.select(".dislike")
            .classed("active", true);

            d3.select(".like")
            .classed("active", false);
        }
        questionData[index].like = like;
        
        d3.select(".questionForm")
        .selectAll(".bottom")
        .transition()
        .style("opacity", "1")
        .style("pointer-events", "all");
    }

    let nextHandler = () => {
        correct = false;

        d3.selectAll(".choice")
        .style("background-color", "white")
        .style("color", "black")
        .style("pointer-events", "all");
        
        let submittedTime = new Date().getTime();

        questionData[index].startQuestionTime = startTimeRef.current;
        questionData[index].submittedTime = submittedTime;
        startTimeRef.current = submittedTime;

        if (index < question.length - 1) {
            setIndex(index + 1);
            d3.select(".questionForm")
            .selectAll(".bottom, .top, .rating")
            .transition()
            .style("opacity", "0")
            .style("pointer-events", "none");

            d3.select(".additional")
            .transition()
            .style("opacity", "0");

            d3.selectAll(".like, .dislike")
            .classed("active", false);

            if (questionCallback instanceof Function)
                questionCallback(questionData[index], [...submittedAnswers.current]);
        } else {
            closeQuestionContainer();
            
            if (questionCallback instanceof Function)
                questionCallback(questionData[index], [...submittedAnswers.current]);
            
            if (endCallback instanceof Function)
                endCallback();
        }
        setDisplayExplanation(null);
        submittedAnswers.current.clear();
    }

    let trim = () => {
        if (reviewCallback instanceof Function)
            reviewCallback(startTime[index], endTime[index]);
    }

    let closeQuestionContainer = () => {
        d3.select("#container")
        .transition()
        .duration(1000)
        .style("gap", "0px")

        d3.select(".questionContainer")
        .transition()
        .duration(1000)
        .style("width", "0%");
    }

    let openQuestionContainer = () => {
        d3.select("#container")
        .transition()
        .duration(1000)
        .style("gap", "10px")

        d3.select(".questionContainer")
        .transition()
        .duration(1000)
        .style("width", "28%");
    }

    useEffect(() => {
        setIndex(0);
        let questions = [], answers = [];
        let choiceAs = [], choiceBs = [], choiceCs = [], choiceDs = [];
        let startTimes = [], endTimes = [];
        let subtitles = [];
        let explanation = [];
        
        d3.select(".questionForm")
        .selectAll(".bottom, .top, .additional, .rating")
        .style("opacity", "0")
        .style("pointer-events", "none");

        d3.selectAll(".choice")
        .style("background-color", "white")
        .style("color", "black")
        .style("pointer-events", "all");

        d3.selectAll(".like, .dislike")
        .classed("active", false);

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
            for (let parseQuestion of questionData) {
                questions.push(parseQuestion.question);
                choiceAs.push(parseQuestion.choiceA);
                choiceBs.push(parseQuestion.choiceB);
                choiceCs.push(parseQuestion.choiceC);
                choiceDs.push(parseQuestion.choiceD);
                answers.push(parseQuestion.answer);
                startTimes.push(parseQuestion.startTime);
                endTimes.push(parseQuestion.endTime);
                explanation.push(parseQuestion.explanation);
            }
        } catch (e) {
            console.log(e);
        };

        if (questions.length > 0) {
            openQuestionContainer();
            startTimeRef.current = new Date().getTime();
        } else {
            closeQuestionContainer();
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
        setExplanation(explanation);

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
                    <div className={"explanation"}>
                        <Textfit mode="multi" className="textFit" max={16}>{displayExplanation}</Textfit>
                    </div>
                </div>

                <div className={"questionDiv"}>
                    <div className={"question"}>
                        <Textfit mode="multi" className="textFit" max={20}>{question[index]}</Textfit>
                    </div>

                    <div className={"choices"}>
                        <div ref={refA} className={"choice"} onClick={() => checkChoice("A", refA)}>
                            <Textfit mode="multi" className="textFit" max={16}>{choiceA[index]}</Textfit>
                        </div>
                        
                        <div ref={refB} className={"choice"} onClick={() => checkChoice("B", refB)}>
                            <Textfit mode="multi" className="textFit" max={16}>{choiceB[index]}</Textfit>
                        </div>
                        <div ref={refC} className={"choice"} onClick={() => checkChoice("C", refC)}>
                            <Textfit mode="multi" className="textFit" max={16}>{choiceC[index]}</Textfit>
                        </div>
                        <div ref={refD} className={"choice"} onClick={() => checkChoice("D", refD)}>
                            <Textfit mode="multi" className="textFit" max={16}>{choiceD[index]}</Textfit>
                        </div>
                    </div>
                </div>

                <div className="rating">
                    <div>
                        <div className="like grow">
                            <FontAwesomeIcon icon={faThumbsUp} onClick={() => handleRating(true)} />
                        </div>
                        <div className="dislike grow">
                            <FontAwesomeIcon icon={faThumbsDown} onClick={() => handleRating(false)} />
                        </div>
                    </div>
                    <div>
                        <Textfit mode="single" className="textFit" forceSingleModeWidth={true}>Please rate the question</Textfit>
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
                        <Textfit mode="single" className="textFit">
                            Review the video
                        </Textfit>
                    </div>
                </div>
            </div>
        </div>
    );
}
