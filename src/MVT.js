import {Component} from "react";
import _ from "lodash";
import {
    Button, ButtonGroup,
    Container,
    Form,
    FormCheck,
    FormControl,
    FormGroup,
    FormSelect,
    InputGroup, OverlayTrigger,
    Table, Tooltip
} from "react-bootstrap";
import FormCheckInput from "react-bootstrap/FormCheckInput";
import FormCheckLabel from "react-bootstrap/FormCheckLabel";
import {Memory} from "./memory";

export class MVT extends Component{
    constructor(props) {
        super(props);
        this.state = {
            mmSize: 256,
            osSize: 56,
            jobSizes: "60 100 50 50 30",
            jobArrivalTimes: "0 5 5 10 15",
            jobRuntimes: "10 15 20 8 15",
            algo: 0,
            compaction: true,
            fullArithmetic: true,
            generatedDom: null
        };

        this.handleInputChange = this.handleInputChange.bind(this);
        this.tryCalculate = this.tryCalculate.bind(this);
        this.tryRandomize = this.tryRandomize.bind(this);
        this.scheduleCalculate = this.scheduleCalculate.bind(this);
    }

    handleInputChange(event) {
        const target = event.target;
        let value = target.type === 'checkbox' ? target.checked : target.value;
        const name = target.name;
        if (name === "algo") {
            value = parseInt(value);
        }
        this.setState({
            [name]: value
        });
    }

    tryRandomize() {
        let n = Math.floor(Math.random() * 10 + 5);
        let sizes = [], aTimes = [], rTimes = [];
        let allowedSize = (this.state.mmSize - this.state.osSize) / 2 / 10;
        for (let i = 0; i < n; i++) {
            sizes.push((Math.floor(Math.random() * allowedSize + 1) * 10) + Math.floor(Math.random() * 10));
            aTimes.push(Math.floor(Math.random() * 10));
            rTimes.push(Math.floor(Math.random() * 10 + 10));
        }
        this.setState({
            jobSizes: sizes.join(" "),
            jobArrivalTimes: aTimes.sort().join(" "),
            jobRuntimes: rTimes.join(" "),
            generatedDom: null
        });
        this.scheduleCalculate();
    }

    scheduleCalculate() {
        setTimeout(() => this.tryCalculate(), 1);
    }

    tryCalculate() {
        let jobSizes = this.state.jobSizes.split(" ").map(i => parseInt(i));
        let jobArrivalTimes = this.state.jobArrivalTimes.trim().length < 1 ? (new Array(jobSizes.length).fill(0)) : this.state.jobArrivalTimes.split(" ").map(i => parseInt(i));
        let jobRuntimes = this.state.jobRuntimes.split(" ").map(i => parseInt(i));

        let memoryFramesGUI = [];
        let jobs = [];
        for (let i = 0; i < jobSizes.length; i++) {
            jobs.push({
                size: jobSizes[i],
                arrivalTime: jobArrivalTimes[i],
                origRunTime: jobRuntimes[i],
                runTime: jobRuntimes[i],
                startedTime: null,
                finishedTime: null,
                waitTime: null,
                currentMemory: null,
                reArranged: false
            })
        }
        let jobIndices = Array.from(jobs.keys());
        jobIndices.sort((aIndex, bIndex) => {
            let a = jobs[aIndex];
            let b = jobs[bIndex];
            if(a.arrivalTime > b.arrivalTime) {
                return 1;
            }
            if(a.arrivalTime < b.arrivalTime) {
                return -1;
            }
            return 0;
        });

        if (jobSizes.length !== jobRuntimes.length) {
            this.setState({
                generatedDom: null
            });
            alert("ERROR: Number of jobs are not the same between memory sizes and run times!")
            return;
        }

        let lastChangeTime = null;
        let tasksFinished = true;
        let time = 0;
        let maxArrival = Math.max(...jobArrivalTimes);
        let maxRuntime = Math.max(...jobRuntimes);

        let mem = new Memory(this.state.mmSize);
        mem.partition(this.state.osSize, "OS", "Unallocated");
        let freeMem = this.state.mmSize - this.state.osSize;

        memoryFramesGUI.push([lastChangeTime, time, _.cloneDeep(mem)]);
        lastChangeTime = 0;
        let freedMemory;
        do {
            tasksFinished = true;
            let didSomething = false;
            freedMemory = false;

            for (let i = 0; i < jobs.length; i++) {
                let job = jobs[jobIndices[i]];
                if (!job.reArranged && jobIndices[i] !== i) {
                    job.reArranged = i + 1;
                }

                if (job.arrivalTime > time) {
                    continue;
                }

                if (job.startedTime !== null) {
                    if ((job.origRunTime + job.startedTime) === time) {

                        if (!this.state.fullArithmetic) {
                            let ourPartition = mem.getAvailablePartitionWithUsage(mem.indices(), job.size, `Job ${i + 1}`);
                            if (ourPartition === null) continue;
                            ourPartition.usage = "Unallocated";
                        } else {
                            freeMem += job.size;
                        }

                        job.finishedTime = time;
                        didSomething = true;
                        freedMemory = true;
                        continue;
                    }
                } else {
                    let indices;
                    if (this.state.algo === 0) {
                        indices = mem.indices(); // first-fit
                    } else if (this.state.algo === 1) {
                        indices = mem.sizeSortedIndices(); // best-fit
                    } else if (this.state.algo === 2) {
                        indices = mem.sizeSortedIndicesReverse(); // worst-fit
                    }

                    if (!this.state.fullArithmetic) {
                        let availablePartition = mem.getAvailablePartitionWithUsage(indices, job.size, "Unallocated")
                        if (availablePartition === null) {
                            continue;
                        }
                        mem.partition(availablePartition.start + job.size, `Job ${i + 1}`, "Unallocated")
                        job.currentMemory = mem.sumSizesOfUsage("Unallocated");
                    } else {
                        if (job.size > freeMem) {
                            continue;
                        }
                        freeMem -= job.size;
                        job.currentMemory = freeMem;
                    }

                    job.startedTime = time;
                    job.waitTime = time - job.arrivalTime;
                    didSomething = true;
                    tasksFinished = false;
                }

                if (job.finishedTime === null) {
                    tasksFinished = false;
                }
            }
            if (!this.state.fullArithmetic) {
                if (didSomething) {
                    if (this.state.compaction) {
                        mem.tryCompact("Unallocated");
                    } else {
                        mem.tryCoalesce("Unallocated");
                    }
                    memoryFramesGUI.push([lastChangeTime, time, _.cloneDeep(mem)]);
                    lastChangeTime = time;
                }
                // hack to re-do the same clock cycle because a job freed memory...
                // so that available jobs that arrived at that same exact time can take it with no wait time
                if (!freedMemory) {
                    time++;
                }
            } else {
                time++;
            }
        } while ((!tasksFinished || freedMemory || time <= (maxArrival + maxRuntime)) && time < 100000);

        this.setState({
            generatedDom: (
                <Container>
                    <p>
                        <strong>Usable Memory: </strong>{this.state.mmSize - this.state.osSize}KB
                    </p>
                    <p>
                        <strong>Job Queue Finish Time: </strong>{time} minutes
                    </p>
                    <Table>
                        <thead>
                        <tr>
                            <th>Job #</th>
                            <th>Job Size</th>
                            <th>Arrival Time</th>
                            <th>Run Time</th>
                            <th>Time Started</th>
                            <th>Time Finished</th>
                            <th>Waiting Time</th>
                            <th>Memory Available (after exec.)</th>
                        </tr>
                        </thead>
                        <tbody>{
                            jobs.map((job, i) => (<tr key={i}>
                                <td>{i + 1}</td>
                                <td>{job.size}</td>
                                <td>{!job.reArranged ? job.arrivalTime : (<span>{job.arrivalTime}&nbsp;<OverlayTrigger overlay={
                                        <Tooltip>
                                            {`Internally running as #${job.reArranged} due to unsorted arrival times`}
                                        </Tooltip>
                                    }
                                    placement="bottom"
                                ><i className="bi bi-exclamation-triangle text-warning" />
                                </OverlayTrigger></span>)}</td>
                                <td>{job.origRunTime}</td>
                                <td>{job.startedTime}</td>
                                <td>{job.finishedTime}</td>
                                <td>{job.waitTime}</td>
                                <td>{job.currentMemory}</td>
                            </tr>))
                        }</tbody>
                    </Table>
                    {
                        this.state.fullArithmetic ? [] : memoryFramesGUI.map((a, i) => {
                            const [pre, post, m] = a;
                            return (<div key={i}>
                                <strong>{
                                    pre === null ? "Initialization" : `${pre} - ${post}`
                                }: </strong>
                                <div className="progress">{m.visualize()}</div>
                            </div>);
                        })
                    }
                </Container>
            )
        });
    }

    render() {
        return (
            <Container>
                <h1>Multiple Variable Partition Technique (MVT) Solver</h1>
                <Form>
                    <FormGroup>
                        <label htmlFor="mmSize">Main Memory Size:</label>
                        <FormControl type="text" name="mmSize" required
                                     value={this.state.mmSize}
                                     onChange={this.handleInputChange}/>
                    </FormGroup>
                    <FormGroup>
                        <label htmlFor="osSize">OS Size:</label>
                        <FormControl type="text" name="osSize" required
                                     value={this.state.osSize}
                                     onChange={this.handleInputChange}/>
                    </FormGroup>
                    <FormGroup>
                        <label htmlFor="jobSizes">Job Sizes:</label>
                        <FormControl type="text" name="jobSizes" required
                                     value={this.state.jobSizes}
                                     onChange={this.handleInputChange}/>
                    </FormGroup>
                    <FormGroup>
                        <label htmlFor="jobArrivalTimes">Job Arrival Times:</label>
                        <InputGroup>
                            <FormControl type="text" name="jobArrivalTimes"
                                         value={this.state.jobArrivalTimes}
                                         onChange={this.handleInputChange}/>
                            <Button onClick={() => {
                                this.setState({jobArrivalTimes: ""});
                                this.scheduleCalculate();
                            }}>No Arrival Time</Button>
                        </InputGroup>
                    </FormGroup>
                    <FormGroup>
                        <label htmlFor="jobRuntimes">Job Runtimes:</label>
                        <FormControl type="text" name="jobRuntimes" required
                                     value={this.state.jobRuntimes}
                                     onChange={this.handleInputChange}/>
                    </FormGroup>
                    <FormGroup>
                        <FormCheck>
                            <FormCheckInput name="fullArithmetic" checked={this.state.fullArithmetic}
                                            onChange={this.handleInputChange}/>
                            <FormCheckLabel htmlFor="fullArithmetic">
                                No simulations? (TO-DO: simulation is unstable on some cases & generally slower)
                            </FormCheckLabel>
                        </FormCheck>
                    </FormGroup>
                    <FormGroup>
                        <label htmlFor="algo">Algorithm:</label>
                        <FormSelect
                            name="algo"
                            value={this.state.algo}
                            onChange={this.handleInputChange}
                            disabled={this.state.fullArithmetic}
                        >
                            <option value={0}>First Fit</option>
                            <option value={1}>Best Fit</option>
                            <option value={2}>Worst Fit</option>
                        </FormSelect>
                    </FormGroup>
                    <FormGroup>
                        <FormCheck>
                            <FormCheckInput name="compaction" checked={this.state.compaction}
                                            onChange={this.handleInputChange}
                                            disabled={this.state.fullArithmetic}/>
                            <FormCheckLabel htmlFor="compaction">Compaction?</FormCheckLabel>
                        </FormCheck>
                    </FormGroup>
                    <FormGroup>
                        <small>* All sizes are in KB, all times are in minutes.</small>
                    </FormGroup>
                    <FormGroup>
                        <ButtonGroup className="d-flex">
                            <Button onClick={this.tryCalculate} className="w-100">Calculate!</Button>
                            <Button onClick={this.tryRandomize} className="w-100">Randomize!</Button>
                        </ButtonGroup>
                    </FormGroup>
                </Form>
                <hr/>
                {this.state.generatedDom}
                <footer style={{height: 50}}/>
            </Container>
        );
    }
}