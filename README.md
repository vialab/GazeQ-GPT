# GazeQ-GPT: Gaze-Driven Question Generation for Personalized Learning from Short Educational Videos

## Project Summary
Effective comprehension is essential for learning and understanding new material. However, human-generated questions often fail to cater to individual learners' needs and interests. We propose a novel approach that leverages a gaze-driven interest model and a Large Language Model (LLM) to generate personalized comprehension questions automatically for short (~10 min) educational video content. Our interest model scores each word in a subtitle. The top-scoring words are then used to generate questions using an LLM. Additionally, our system provides marginal help by offering phrase definitions (glosses) in subtitles, further facilitating learning. These methods are integrated into a prototype system, GazeQ-GPT, automatically focusing learning material on specific content that interests or challenges them, promoting more personalized learning. A user study ($N=40$) shows that GazeQ-GPT prioritizes words in the fixated gloss and rewatched subtitles with higher ratings toward glossed videos. Compared to ChatGPT, GazeQ-GPT achieves higher question diversity while maintaining quality, indicating its potential to improve personalized learning experiences through dynamic content adaptation.

## Getting Started

### Prerequisites
- Install [Node.js](https://nodejs.org/en/download/)
- Next, install all dependencies
```
npm install
```
- Tobii Eye Tracker 5

### OpenAI Prerequisites
The current version uses the Assistant API from OpenAI. You must create the Assistant yourself or change it to use the new Responses API.

<details>
<summary>System Prompt for Question Generator Assistant</summary>
<br>
<i>You are a professor making a multiple-choice test about a video. Describe your steps first.</i>
</details>

You also need to attach a vector store to the assistant and upload the subtitle file to the vector store. The subtitle file is provided in `src/assets/videos/*.txt`.

Once everything is set up, in `.env`, please provide the `QUESTION_ASSISTANT_ID` and `FILE_1_ID` from OpenAI. All other IDs are optional to run one video.

### How to Run

1. Calibrate your Tobii Eye Tracker 5
   - Launch the Tobii Experience and click on "Improve calibration"
   - If Tobii Experience is not installed automatically when plugged in, download it [here](https://gaming.tobii.com/getstarted/)
2. Insert your OpenAI API key in `.env`
   - `OPENAI_API_KEY = 'INSERT OPEN AI KEY'`
3. Launch the app
```
npm start
```
*Note: this will start an eye tracker server and the application*

### Troubleshooting

#### Calibrate the Tobii 5
You need to install [Tobii Experience](https://help.tobii.com/hc/en-us/articles/360009929118-Get-the-Tobii-Experience-app) to use the eyetracker.

#### Eye tracker server issues
If the `TobiiServer.exe` file gives you an error about `Tobii.EyeX.Client.dll` being missing, the issue might be with your Visual C++ redistributable. Install the latest versions of BOTH x86 and x64, then try again. Also, download the 2012 versions (both x86 and x64), linked [here](https://learn.microsoft.com/en-GB/cpp/windows/latest-supported-vc-redist?view=msvc-170#visual-studio-2012-vc-110-update-4): 
