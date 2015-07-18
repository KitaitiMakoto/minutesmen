class RecognitionControls extends React.Component {
  render() {
      return (
          <div>
              <p><label>Language: <select name="lang"><option value="en">en</option><option value="ja">ja</option></select></label></p>
              <button id="start-button" type="button">Start</button>
              <button id="stop-button" type="button" disabled>Stop</button>
          </div>
      );
  }
}
