import { useEffect } from "react";
import * as React from "react";
import videojs from "video.js";
import * as d3 from "d3";
// import "video.js/dist/video-js.css";
// import "@videojs/themes/dist/fantasy/index.css";
import "../assets/css/Player.css";

const Component = videojs.getComponent('Component');

class Gradient extends Component {
    constructor(player, options = {}) {
        super(player, options);
        if (options.text) {
            this.updateTextContent(options.text);
        }
    }

    createEl() {
        return videojs.dom.createEl('div', {
            className: 'vjs-gradient'
        });
    }
}

videojs.registerComponent('Gradient', Gradient);

export default function Player({clickCallback, timerCallback, textTrackChangeCallback, endCallback, paused, time, src, track, toggleDefinitions}) {
    useEffect(() => {
        if (videojs.getAllPlayers().length === 0) {
            let player = videojs("video", {
                html5: {
                    nativeTextTracks: false,
                },
                fill: true,
                disablePictureInPicture: true,
            });

            d3.select(".video-js.vjs-theme-fantasy")
            .on("pointerenter", () => {
                d3.select(".vjs-control-bar").transition().style("opacity", "1");
            })
            .on("pointerleave", () => {
                d3.select(".vjs-control-bar").transition().style("opacity", "0");
            });

            player.getChild("ControlBar").addChild("Gradient", {}, 0);

            player.on("click", (e) => {
                if (clickCallback instanceof Function)
                    clickCallback(player.paused());
            });

            player.on("timeupdate", () => {
                if (timerCallback instanceof Function)
                    timerCallback(player.currentTime());
            });

            player.on("ended", () => {
                if (endCallback instanceof Function)
                    endCallback();
            });
        }
    }, []);

    useEffect(() => {
        let player = videojs.getAllPlayers()[0];

        if (player) {
            player.on("texttrackchange", function () {                
                if (d3.select(".vjs-text-track-cue").empty()) {
                    return;
                }
                let text = d3.select(".vjs-text-track-cue").select("div").text();
                d3.select(".vjs-text-track-cue").select("div").text("");
                // d3.selectAll(".vjs-text-track-cue div span").style("background-color", null);
                let lines = text.split("\n");

                for (let i = 0; i < lines.length; i++) {
                    const words = lines[i].split(" ");
                    
                    for (let word of words) {
                        d3.select(".vjs-text-track-cue")
                        .select("div")
                        .append("span")
                        .text(word);

                        d3.select(".vjs-text-track-cue")
                        .select("div")
                        .html(d3.select(".vjs-text-track-cue").select("div").html() + " ");
                    }
                    if (i < lines.length - 1)
                        d3.select(".vjs-text-track-cue").select("div").append("span").text("\n");
                }

                // if (textTrackChangeCallback instanceof Function)
                //     textTrackChangeCallback();
            });
            let timeout = null;

            player.on("playerresize", (e) => {
                const config = { childList: true, subtree: true };

                const callback = (mutationList, observer) => {
                    for (const mutation of mutationList) {
                        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
                            player.trigger("texttrackchange");
                            clearTimeout(timeout);

                            timeout = setTimeout(() => {
                                if (textTrackChangeCallback instanceof Function)
                                    textTrackChangeCallback();
                            }, 500);
                            observer.disconnect();
                            return;
                        }
                    }
                };
                const observer = new MutationObserver(callback);
                observer.observe(d3.select(".vjs-text-track-display").node(), config);
            });
        }
    }, [textTrackChangeCallback]);

    useEffect(() => {
        let player = videojs.getAllPlayers()[0];
        
        if (player) {
            if (paused) {
                player.pause();
            } else {
                // if (time >= 0) {
                //     player.currentTime(time);
                // }
                player.play();
            }
        }
    }, [paused]);

    useEffect(() => {
        let player = videojs.getAllPlayers()[0];

        if (player) {
            player.src({src: src, type: "video/mp4"});
            player.addRemoteTextTrack({ src: track, kind: "subtitles", srclang: "en", label: "English", default: true }, false);
            player.currentTime(0)
        }
    }, [src, track]);

    useEffect(() => {
        let player = videojs.getAllPlayers()[0];

        if (player) {
            d3.select(player.el_)
            .transition()
            .duration(1000)
            .styleTween("transform", () => d3.interpolate(d3.select(player.el_).style("transform"), toggleDefinitions ? "translateX(0%)" : "translateX(-15%)"));
        }
    }, [toggleDefinitions]);

    return (
        <video
            src={src}
            controls
            width="100%"
            height="100%"
            id="video"
            className="video-js vjs-theme-fantasy"
            style={{objectFit: "cover"}}
        />
    )
}