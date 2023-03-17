import './App.css';
import {
    Button,
    Container,
    Form,
    FormCheck,
    FormControl,
    FormGroup,
    FormSelect,
    ProgressBar,
    Table
} from "react-bootstrap";
import {Component} from "react";
import FormCheckInput from "react-bootstrap/FormCheckInput";
import FormCheckLabel from "react-bootstrap/FormCheckLabel";

const _ = require('lodash');

class MemoryPartition {
    constructor(start, size) {
        this.start = start;
        this.size = size;
        this.usage = "Unallocated";
    }
}

class Memory {
    constructor(size) {
        this.size = size
        this.partitions = [new MemoryPartition(0, size)]
    }

    /**
     * @param offset
     * @param aName
     * @param bName
     * @returns {number} The index of the new partition
     */
    partition(offset, aName, bName) {
        if (offset === this.size) {
            this.partitions[this.partitions.length - 1].usage = aName;
            return this.partitions.length - 1;
        }

        for (let i = 0; i < this.partitions.length; i++) {
            let partition = this.partitions[i];
            let partitionEnd = partition.start + partition.size;

            if (partition.start < offset && offset < partitionEnd) {
                let newPartition = new MemoryPartition(offset, partitionEnd - offset);
                if (newPartition.size > 0) {
                    this.partitions.splice(i + 1, 0, newPartition);
                    newPartition.usage = bName;
                }
                partition.usage = aName;
                partition.size = offset - partition.start;

                return i + 1;
            }
        }
    }

    visualize() {
        return this.partitions.map((partition, i) => {
            const colorMap = ['success', 'danger', 'warning', 'info'];
            let isUnused = partition.usage.toLowerCase() === "unused";
            return (<ProgressBar
                key={i}
                style={{width: `${partition.size / this.size * 100}%`}}
                variant={isUnused ? null : colorMap[i % colorMap.length]}
                isChild={true}
                label={`${partition.usage} (${partition.size}K)`}
            />);
        })
    }

    indices() {
        return Array.from(this.partitions.keys());
    }

    sizeSortedIndices() {
        return this.indices().sort((indexA, indexB) => {
            let sizeA = this.partitions[indexA].size;
            let sizeB = this.partitions[indexB].size;
            if (sizeA < sizeB) return -1;
            if (sizeA > sizeB) return 1;
            return 0;
        });
    }

    sizeSortedIndicesReverse() {
        return this.sizeSortedIndices().reverse();
    }

    getAvailablePartitionWithUsage(indices, requiredSize, usage) {
        usage = usage.toLowerCase();
        for (let i = 0; i < indices.length; i++) {
            let partition = this.partitions[indices[i]];
            if (partition.usage.toLowerCase() !== usage || partition.size < requiredSize) {
                continue;
            }
            return partition;
        }
        return null;
    }

    sumSizesOfUsage(usage) {
        usage = usage.toLowerCase();
        let sum = 0;
        for (let i = 0; i < this.partitions.length; i++) {
            let partition = this.partitions[i];
            if (partition.usage.toLowerCase() !== usage) {
                continue;
            }
            sum += partition.size;
        }
        return sum;
    }

    tryCoalesce(usage) {
        usage = usage.toLowerCase();

        let partitionsCopy = _.cloneDeep(this.partitions);

        let didSomething;
        do {
            didSomething = false;
            for (let i = 1; i < partitionsCopy.length; i++) {
                let partition = partitionsCopy[i];
                if (partition.usage.toLowerCase() !== usage) {
                    continue;
                }
                let prevPartition = partitionsCopy[i - 1];
                if (partition.usage !== prevPartition.usage) {
                    continue;
                }

                didSomething = true;

                let combined = new MemoryPartition(prevPartition.start, partition.size + prevPartition.size);
                combined.usage = prevPartition.usage;
                partitionsCopy.splice(i - 1, 2, combined);
                break;
            }
        } while (didSomething);

        this.partitions = partitionsCopy;
    }

    tryCompact(ignoreUsage) {
        const ignoreUsageLC = ignoreUsage.toLowerCase();

        let offset = 0;
        let newPartitions = [];
        for (let i = 0; i < this.partitions.length; i++) {
            let partition = this.partitions[i];
            if (partition.usage.toLowerCase() === ignoreUsageLC) {
                continue;
            }
            let newPartition = new MemoryPartition(offset, partition.size);
            newPartition.usage = partition.usage;
            newPartitions.push(newPartition);
            offset += partition.size;
        }

        if (offset < this.size) {
            let newPartition = new MemoryPartition(offset, this.size - offset);
            newPartition.usage = ignoreUsage;
            newPartitions.push(newPartition);
        }

        this.partitions = newPartitions;
    }
}

class App extends Component {
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
            numberOfGuests: 2,
            generatedDom: null
        };

        this.handleInputChange = this.handleInputChange.bind(this);
        this.tryCalculate = this.tryCalculate.bind(this);
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

    tryCalculate(event) {
        event.preventDefault()
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
            })
        }

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

        let mem = new Memory(this.state.mmSize);
        mem.partition(this.state.osSize, "OS", "Unallocated");
        let freeMem = this.state.mmSize - this.state.osSize;

        memoryFramesGUI.push([lastChangeTime, time, _.cloneDeep(mem)]);
        lastChangeTime = 0;
        do {
            tasksFinished = true;
            let didSomething = false;

            for (let i = 0; i < jobs.length; i++) {
                let job = jobs[i];

                if (job.arrivalTime > time) {
                    continue;
                }

                if (job.startedTime !== null) {
                    if ((job.origRunTime + job.startedTime) === time) {

                        /*let ourPartition = mem.getAvailablePartitionWithUsage(mem.indices(), job.size, `Job ${i + 1}`);
                        if (ourPartition === null) continue;
                        ourPartition.usage = "Unallocated";*/
                        freeMem += job.size;

                        job.finishedTime = time;
                        didSomething = true;
                        continue;
                    }
                } else {
                    /*let indices;
                    if (this.state.algo === 0) {
                        indices = mem.indices(); // first-fit
                    } else if (this.state.algo === 1) {
                        indices = mem.sizeSortedIndices(); // best-fit
                    } else if (this.state.algo === 2) {
                        indices = mem.sizeSortedIndicesReverse(); // worst-fit
                    }

                    let availablePartition = mem.getAvailablePartitionWithUsage(indices, job.size, "Unallocated")
                    if (availablePartition === null) {
                        continue;
                    }
                    mem.partition(availablePartition.start + job.size, `Job ${i + 1}`, "Unallocated")*/


                    if (job.size > freeMem){
                        continue;
                    }
                    freeMem -= job.size;

                    job.currentMemory = freeMem;//mem.sumSizesOfUsage("Unallocated");
                    job.startedTime = time;
                    job.waitTime = time - job.arrivalTime;
                    didSomething = true;
                }

                if (job.finishedTime === null) {
                    tasksFinished = false;
                }
            }

            if (didSomething) {
                /*if (this.state.compaction) {
                    mem.tryCompact("Unallocated");
                } else {
                    mem.tryCoalesce("Unallocated");
                }
                memoryFramesGUI.push([lastChangeTime, time, _.cloneDeep(mem)]);*/
                lastChangeTime = time;
            }
            time++;
        } while (!tasksFinished && time < 1000);

        this.setState({
            generatedDom: (
                <Container>
                    <p>
                        <strong>Usable Memory: </strong>{this.state.mmSize - this.state.osSize}KB
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
                                <td>{job.arrivalTime}</td>
                                <td>{job.origRunTime}</td>
                                <td>{job.startedTime}</td>
                                <td>{job.finishedTime}</td>
                                <td>{job.waitTime}</td>
                                <td>{job.currentMemory}</td>
                            </tr>))
                        }</tbody>
                    </Table>
                    {
                        /*memoryFramesGUI.map((a, i) => {
                            const [pre, post, m] = a;
                            return (<div key={i}>
                                <strong>{
                                    pre === null ? "Initialization" : `${pre} - ${post}`
                                }: </strong>
                                <div className="progress">{m.visualize()}</div>
                            </div>);
                        })*/
                    }
                </Container>
            )
        });
    }

    render() {
        return (
            <Container>
                <h1>Multiple Variable Partition Technique (MVT) Solver</h1>
                <Form onSubmit={this.tryCalculate}>
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
                        <FormControl type="text" name="jobArrivalTimes"
                                     value={this.state.jobArrivalTimes}
                                     onChange={this.handleInputChange}/>
                    </FormGroup>
                    <FormGroup>
                        <label htmlFor="jobRuntimes">Job Runtimes:</label>
                        <FormControl type="text" name="jobRuntimes" required
                                     value={this.state.jobRuntimes}
                                     onChange={this.handleInputChange}/>
                    </FormGroup>
                    {/*<FormGroup>
                        <label htmlFor="algo">Algorithm:</label>
                        <FormSelect
                            name="algo"
                            value={this.state.algo}
                            onChange={this.handleInputChange}>
                            <option value={0}>First Fit</option>
                            <option value={1}>Best Fit</option>
                            <option value={2}>Worst Fit</option>
                        </FormSelect>
                    </FormGroup>
                    <FormGroup>
                        <FormCheck>
                            <FormCheckInput name="compaction" checked={this.state.compaction}
                                            onChange={this.handleInputChange}/>
                            <FormCheckLabel htmlFor="compaction">Compaction?</FormCheckLabel>
                        </FormCheck>
                    </FormGroup>*/}
                    <FormGroup>
                        <small>* All sizes are in KB, all times are in milliseconds (ms).</small>
                    </FormGroup>
                    <FormGroup>
                        <FormControl type="submit" value="Submit" />
                    </FormGroup>
                </Form>
                <hr/>
                {this.state.generatedDom}
                <footer style={{height: 50}}/>
            </Container>
        );
    }
}

export default App;
