import React, { useEffect, useRef } from "react";
import * as d3 from "d3";
import "../assets/css/DefinitionsContainer.css";

export default function DefinitionsContainer({ collocations, show, showDefinition, showMoreInfo, onPrev, definitionCallback }) {
    let definitionsContainer = useRef(null);
    let bottom = useRef(null), top = useRef(null);
    let definitionRefs = useRef(new Map());
    let definitionTimeout = useRef(null);
    let definition = useRef(null);
    let definitionMore = useRef(null);
    let definitionCallbackRef = useRef(definitionCallback);

    let [ moreInfo, setMoreInfo ] = React.useState(null);

    useEffect(() => {
        definitionCallbackRef.current = definitionCallback;
    }, [definitionCallback])

    useEffect(() => {
        if (showDefinition && !definitionMore.current) {
            clearTimeout(definitionTimeout.current);

            definitionTimeout.current = setTimeout(() => {
                let collocation = JSON.parse(showDefinition);
                definition.current = collocation.join(" ");
                let ref = definitionRefs.current.get(definition.current).current;
                let height = d3.select(ref).select("span").select("p").node().getBoundingClientRect().height;

                d3.select(definitionsContainer.current)
                .selectAll(".collocation")
                .transition()
                .duration(400)
                .style("gap", "0px");

                d3.select(definitionsContainer.current)
                .selectAll(".collocation > span")
                .transition()
                .duration(400)
                .style("max-height", "0px");

                d3.select(ref)
                .transition()
                .duration(400)
                .style("gap", "10px")

                d3.select(ref)
                .select("span")
                .transition()
                .duration(400)
                .style("max-height", height + "px")
                .on("end", () => {
                    definitionTimeout.current = null;
                    
                    if (definitionCallbackRef.current instanceof Function) 
                        definitionCallbackRef.current(definition.current, collocations.get(definition.current), ref, "collocation");
                });
            }, 500);
        } else {
            clearTimeout(definitionTimeout.current);
            definitionTimeout.current = null;
        }
    }, [showDefinition]);

    useEffect(() => {
        definitionCallbackRef.current = definitionCallback;
    }, [definitionCallback])

    useEffect(() => {
        d3.select("#moreInfoContainer")
        .transition()
        .style("opacity", "0");

        if (show) {
            d3.select(definitionsContainer.current)
            .transition()
            .duration(500)
            .style("right", "0%");
        } else {
            d3.selectAll(".collocation")
            .transition()
            .style("gap", "0px")
            .style("opacity", "1");

            d3.selectAll(".collocation")
            .select("span")
            .transition()
            .style("max-height", "0px");

            d3.select(definitionsContainer.current)
            .transition()
            .duration(500)
            .style("right", "-20%");

            if (definition.current) {
                let ref = definitionRefs.current.get(definition.current);

                d3.select(ref.current)
                .transition()
                .style("gap", "0px")
                .styleTween("transform", () => d3.interpolate(d3.select(ref.current).style("transform"), `translate(0px, 0px)`));

                definition.current = null;
                definitionMore.current = null;
            }
        }
        d3.selectAll([bottom.current, top.current])
        .transition()
        .style("opacity", "0");
    }, [show]);
    
    useEffect(() => {
        return;
        if (definition.current && showMoreInfo && !definitionMore.current && collocations.get(definition.current).definitions.definitionTerm1) {
            clearTimeout(definitionTimeout.current);
            definitionTimeout.current = null;

            let ref = definitionRefs.current.get(definition.current);
            let opacity = d3.select(ref.current).style("opacity");
            let bbox = ref.current.getBoundingClientRect();
            let topBBox = top.current.getBoundingClientRect();
            let dy = bbox.y - topBBox.y - topBBox.height - 20;

            d3.selectAll(".collocation")
            .transition(1000)
            .style("opacity", "0");

            d3.select(ref.current)
            .transition()
            .duration(1000)
            .styleTween("opacity", () => d3.interpolate(opacity ,"1"))
            .styleTween("transform", () => d3.interpolate(`translate(0px, 0px)`, `translate(0px, ${-dy}px)`));
            
            let moreInfoContainer = ref.current;

            d3.select("#moreInfoContainer")
            .style("top", `${topBBox.y + topBBox.height + bbox.height + 100}px`)
            .transition()
            .delay(500)
            .duration(500)
            .style("opacity", "1")
            .style("top", `${topBBox.y + topBBox.height + bbox.height + 40}px`);

            if (definitionCallbackRef.current instanceof Function) 
                definitionCallbackRef.current(definition.current, collocations.get(definition.current), moreInfoContainer, "moreInfo");

            definitionMore.current = definition.current;
            setMoreInfo(collocations.get(definition.current));

            d3.select(bottom.current)
            .transition()
            .style("opacity", "0");

            d3.select(top.current)
            .transition()
            .style("opacity", "1");
        }
    }, [showMoreInfo]);

    useEffect(() => {
        if (onPrev && definitionMore.current) {
            let ref = definitionRefs.current.get(definitionMore.current).current;
            let transform = d3.select(ref).style("transform");

            d3.selectAll(".collocation")
            .transition()
            .duration(1000)
            .style("opacity", "1");

            d3.select(ref)
            .transition()
            .duration(1000)
            .styleTween("transform", () => d3.interpolate(transform, `translate(0px, 0px)`));
            
            if (definitionCallbackRef.current instanceof Function) 
                definitionCallbackRef.current(definitionMore.current, collocations.get(definitionMore.current), ref, "prev");

            d3.select("#moreInfoContainer")
            .transition()
            .style("opacity", "0")
            .on("end", () => setMoreInfo(null));

            definitionMore.current = null;

            d3.select(bottom.current)
            .transition()
            .style("opacity", "1");

            d3.select(top.current)
            .transition()
            .style("opacity", "0");
        }
    }, [onPrev]);

    useEffect(() => {
        d3.selectAll([bottom.current, top.current])
        .transition()
        .style("opacity", "0");

        d3.select("#moreInfoContainer")
        .transition()
        .style("opacity", "0");

        d3.selectAll(".collocation")
        .style("gap", "0px")
        .style("opacity", "1");

        d3.selectAll(".collocation")
        .select("span")
        .style("max-height", "0px");

        setMoreInfo(null);
        definitionMore.current = null;
        definition.current = null;
    }, [collocations]);

    let skipTerms = [];

    if (moreInfo) {
        for (let i = 1; "skipTerm" + i in moreInfo; i++) {
            if (moreInfo["skipTerm" + i] === false) {
                skipTerms.push(
                    <div className="collocationInfo" style={{ textAlign: "center" }} collocation={JSON.stringify(moreInfo["definitions"]["definitionTerm" + i].collocation)} key={moreInfo["definitions"]["definitionTerm" + i].term}>
                        <b> { moreInfo["definitions"]["definitionTerm" + i].term } </b>
                        <span><p> { moreInfo["definitions"]["definitionTerm" + i].definition.toLowerCase() } </p></span>
                    </div>
                );
            } else if (moreInfo["skipTerm" + i] instanceof Object) {
                skipTerms.push(
                    <div className="collocationInfo" style={{ textAlign: "center" }} collocation={JSON.stringify(moreInfo["skipTerm" + i].collocation)} key={moreInfo["skipTerm" + i].definitionPhrase.phrase}>
                        <b> { moreInfo["skipTerm" + i].subtitle } </b>
                        <span><p> { moreInfo["skipTerm" + i].definitionPhrase.definition.toLowerCase() } </p></span>
                    </div>
                );
            }
        }
    }

    return (
        <div id="definitionsContainer" ref={definitionsContainer} >
            <div id="collocationsContainer">
                { collocations ? [...collocations.entries()].map(([_, collocation], index) => {
                    let ref = React.createRef();
                    definitionRefs.current.set(collocation["collocation"].join(" "), ref);

                    return (
                        <div className="collocationDiv" key={JSON.stringify(collocation["collocation"])}>
                            <div className="collocation" style={{ textAlign: "center" }} collocation={JSON.stringify(collocation["collocation"])} ref={ref}>
                                <b> { collocation["subtitle"] } </b>
                                <span style={{ maxHeight: 0 }}><p> { collocation["definitions"].definitionPhrase.definition.toLowerCase() } </p></span>
                            </div>
                        </div>
                    );
                }) : null}
            </div>
            <div id="moreInfoContainer">
                {moreInfo ? 
                    <>
                        <hr style={{width: "90%", border: "1px solid rgba(57, 57, 58, 0.5)", margin: "0"}}/>

                        { skipTerms }

                        { [...moreInfo["additional"].entries()].map(([_, additional], index) => {
                            return (
                                <div className="collocationInfo" style={{ textAlign: "center" }} collocation={JSON.stringify(additional["collocation"])} key={additional.definitionPhrase.phrase}>
                                    <b> { additional.subtitle } </b>
                                    <span><p> { additional.definitionPhrase.definition.toLowerCase() } </p></span>
                                </div>
                            )
                        })}
                    </>
                : null }
            </div>

            <div className="top" ref={top}>
                <button className={"round"} id="prev" >
                    <span id={"cta"}>
                        <span className={"arrow next primera"}></span>
                        <span className={"arrow next segunda"}></span>
                    </span>
                </button>
                <span id="info">
                    Look here to go back
                </span>
            </div>

            <div className="bottom" ref={bottom}>
                <span id="info">
                    Look here for more info
                </span>
                <button className={"round"} id="moreInfo" >
                    <span id={"cta"}>
                        <span className={"arrow next primera"}></span>
                        <span className={"arrow next segunda"}></span>
                    </span>
                </button>
            </div>
        </div>
    );
}